import { Injectable } from '@nestjs/common';
import type { CachePort } from '../../application/ports/cache.port';
import type { LeaderboardEntry, RecentScore } from '../../application/ports/records';
import { RECENT_SCORES_MAX, RECENT_WORDS_MAX, RECENT_WORDS_TTL_SECONDS, redisKeys } from './keys';
import { RedisService } from './redis.service';

interface LeaderboardMeta {
  playerName: string;
  bestRounds: number;
  achievedAt: string;
}

/**
 * Write-through cache in front of Postgres. Reads return null when the cache is cold or Redis is
 * down, and every caller falls back to the database on null.
 */
@Injectable()
export class RedisCacheAdapter implements CachePort {
  constructor(private readonly redis: RedisService) {}

  async readSession<T>(sessionId: string): Promise<T | null> {
    return this.redis.safe(
      async () => {
        const key = redisKeys.session(sessionId);
        const raw = await this.redis.client.get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      },
      null,
      'readSession',
    );
  }

  async writeSession<T>(sessionId: string, view: T, ttlSeconds: number): Promise<void> {
    await this.redis.safe(
      async () => {
        await this.redis.client.set(
          redisKeys.session(sessionId),
          JSON.stringify(view),
          'EX',
          ttlSeconds,
        );
      },
      undefined,
      'writeSession',
    );
  }

  async dropSession(sessionId: string): Promise<void> {
    await this.redis.safe(
      async () => {
        await this.redis.client.del(redisKeys.session(sessionId));
      },
      undefined,
      'dropSession',
    );
  }

  async readRecentWords(playerId: string): Promise<string[]> {
    return this.redis.safe(
      () => this.redis.client.lrange(redisKeys.recentWords(playerId), 0, RECENT_WORDS_MAX - 1),
      [],
      'readRecentWords',
    );
  }

  async pushRecentWords(playerId: string, words: readonly string[]): Promise<void> {
    if (words.length === 0) return;

    await this.redis.safe(
      async () => {
        const key = redisKeys.recentWords(playerId);
        await this.redis.client
          .multi()
          .lpush(key, ...words)
          .ltrim(key, 0, RECENT_WORDS_MAX - 1)
          .expire(key, RECENT_WORDS_TTL_SECONDS)
          .exec();
      },
      undefined,
      'pushRecentWords',
    );
  }

  async readLeaderboard(limit: number): Promise<LeaderboardEntry[] | null> {
    return this.redis.safe(
      async () => {
        const ready = await this.redis.client.get(redisKeys.leaderboardReady);
        if (ready === null) return null;

        const raw = await this.redis.client.zrevrange(
          redisKeys.leaderboardBest,
          0,
          limit - 1,
          'WITHSCORES',
        );
        if (raw.length === 0) return [];

        const entries: LeaderboardEntry[] = [];
        for (let i = 0; i < raw.length; i += 2) {
          const playerId = raw[i];
          const meta = await this.readMeta(playerId);
          entries.push({
            playerId,
            playerName: meta?.playerName ?? 'player',
            bestScore: Number(raw[i + 1]),
            bestRounds: meta?.bestRounds ?? 0,
            achievedAt: meta ? new Date(meta.achievedAt) : new Date(0),
          });
        }
        return entries;
      },
      null,
      'readLeaderboard',
    );
  }

  /** Replaces the cached leaderboard after a rebuild from the database. */
  async writeLeaderboard(entries: readonly LeaderboardEntry[]): Promise<void> {
    await this.redis.safe(
      async () => {
        const pipeline = this.redis.client.multi();
        pipeline.del(redisKeys.leaderboardBest, redisKeys.leaderboardMeta);
        for (const entry of entries) {
          pipeline.zadd(redisKeys.leaderboardBest, entry.bestScore, entry.playerId);
          pipeline.hset(redisKeys.leaderboardMeta, entry.playerId, metaOf(entry));
        }
        pipeline.set(redisKeys.leaderboardReady, '1');
        await pipeline.exec();
      },
      undefined,
      'writeLeaderboard',
    );
  }

  /** Keeps a player's best score: ZADD GT only raises an existing score. */
  async recordLeaderboardResult(entry: LeaderboardEntry): Promise<void> {
    await this.redis.safe(
      async () => {
        const current = await this.redis.client.zscore(redisKeys.leaderboardBest, entry.playerId);
        if (current !== null && Number(current) >= entry.bestScore) return;

        await this.redis.client
          .multi()
          .zadd(redisKeys.leaderboardBest, entry.bestScore, entry.playerId)
          .hset(redisKeys.leaderboardMeta, entry.playerId, metaOf(entry))
          .exec();
      },
      undefined,
      'recordLeaderboardResult',
    );
  }

  async readRecentScores(limit: number): Promise<RecentScore[] | null> {
    return this.redis.safe(
      async () => {
        const raw = await this.redis.client.lrange(redisKeys.recentScores, 0, limit - 1);
        if (raw.length === 0) return null;
        return raw.map((item) => reviveScore(JSON.parse(item) as RecentScore));
      },
      null,
      'readRecentScores',
    );
  }

  async pushRecentScore(score: RecentScore): Promise<void> {
    await this.redis.safe(
      async () => {
        await this.redis.client
          .multi()
          .lpush(redisKeys.recentScores, JSON.stringify(score))
          .ltrim(redisKeys.recentScores, 0, RECENT_SCORES_MAX - 1)
          .exec();
      },
      undefined,
      'pushRecentScore',
    );
  }

  async isHealthy(): Promise<boolean> {
    return this.redis.isHealthy();
  }

  private async readMeta(playerId: string): Promise<LeaderboardMeta | null> {
    const raw = await this.redis.client.hget(redisKeys.leaderboardMeta, playerId);
    return raw === null ? null : (JSON.parse(raw) as LeaderboardMeta);
  }
}

function metaOf(entry: LeaderboardEntry): string {
  return JSON.stringify({
    playerName: entry.playerName,
    bestRounds: entry.bestRounds,
    achievedAt: entry.achievedAt.toISOString(),
  } satisfies LeaderboardMeta);
}

function reviveScore(score: RecentScore): RecentScore {
  return { ...score, endedAt: new Date(score.endedAt) };
}

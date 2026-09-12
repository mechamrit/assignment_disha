import { Inject, Injectable } from '@nestjs/common';
import { CACHE, type CachePort } from '../ports/cache.port';
import type { LeaderboardEntry } from '../ports/records';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';

export interface LeaderboardRow extends LeaderboardEntry {
  rank: number;
}

/**
 * Best score per player. Redis answers when it holds a rebuilt board; otherwise Postgres does and
 * the board is written back, so an empty or flushed cache costs one query, not a wrong answer.
 */
@Injectable()
export class GetLeaderboard {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
  ) {}

  async execute(limit: number): Promise<LeaderboardRow[]> {
    const cached = await this.cache.readLeaderboard(limit);
    if (cached && cached.length > 0) return rank(cached);

    const entries = await this.repos.sessions.leaderboard(limit);
    await this.cache.writeLeaderboard(entries);
    return rank(entries);
  }
}

function rank(entries: readonly LeaderboardEntry[]): LeaderboardRow[] {
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

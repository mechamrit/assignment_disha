import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE, type CachePort } from '../ports/cache.port';
import type { PlayerRecord, SessionRecord } from '../ports/records';

/**
 * Runs after a session reaches a terminal state and after the transaction has committed. It only
 * touches the cache: Postgres already holds the result, so a failure here costs freshness, never
 * correctness.
 */
@Injectable()
export class OnSessionCompleted {
  private readonly logger = new Logger(OnSessionCompleted.name);

  constructor(@Inject(CACHE) private readonly cache: CachePort) {}

  async execute(session: SessionRecord, player: PlayerRecord): Promise<void> {
    const endedAt = session.endedAt ?? new Date();

    try {
      await this.cache.pushRecentScore({
        sessionId: session.id,
        playerName: player.name,
        score: session.score,
        roundsCleared: session.roundsCleared,
        endedAt,
        endReason: session.endReason,
      });

      await this.cache.recordLeaderboardResult({
        playerId: player.id,
        playerName: player.name,
        bestScore: session.score,
        bestRounds: session.roundsCleared,
        achievedAt: endedAt,
      });
    } catch (error) {
      this.logger.warn(`leaderboard update skipped: ${(error as Error).message}`);
    }
  }
}

import type { LeaderboardEntry, RecentScore } from './records';

/**
 * Redis sits in front of Postgres, never in place of it. Every method here may fail or return
 * nothing, and the caller must carry on against the database when it does.
 */
export interface CachePort {
  readSession<T>(sessionId: string): Promise<T | null>;
  writeSession<T>(sessionId: string, view: T, ttlSeconds: number): Promise<void>;
  dropSession(sessionId: string): Promise<void>;

  /** Words the player heard recently, newest first, used to keep sequences fresh. */
  readRecentWords(playerId: string): Promise<string[]>;
  pushRecentWords(playerId: string, words: readonly string[]): Promise<void>;

  readLeaderboard(limit: number): Promise<LeaderboardEntry[] | null>;
  writeLeaderboard(entries: readonly LeaderboardEntry[]): Promise<void>;
  recordLeaderboardResult(entry: LeaderboardEntry): Promise<void>;

  readRecentScores(limit: number): Promise<RecentScore[] | null>;
  pushRecentScore(score: RecentScore): Promise<void>;

  /** True when Redis answered a ping, used by the health endpoint. */
  isHealthy(): Promise<boolean>;
}

export const CACHE = Symbol('CACHE');

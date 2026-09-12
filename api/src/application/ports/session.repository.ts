import type { EndReason, SessionStatus } from '../../domain/types';
import type { LeaderboardEntry, RecentScore, SessionRecord, SessionWithPlayer } from './records';

export interface CreateSessionInput {
  playerName: string;
  /** Lowercased name used to find a returning player. */
  nameKey: string;
  clientTokenHash: string;
  maxStrikes: number;
  maxRounds: number;
}

/** Fields a compare-and-set update may write. `version` is handled by the adapter. */
export interface SessionPatch {
  status?: SessionStatus;
  score?: number;
  roundsCleared?: number;
  strikes?: number;
  currentRoundNumber?: number;
  botInstanceId?: string | null;
  endReason?: EndReason | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  lastActivityAt?: Date;
}

export interface SessionRepository {
  /** Creates the session and reuses the player row when the nickname has played before. */
  create(input: CreateSessionInput): Promise<SessionWithPlayer>;

  findById(sessionId: string): Promise<SessionRecord | null>;

  findWithPlayer(sessionId: string): Promise<SessionWithPlayer | null>;

  /**
   * Writes only if `version` still matches, then increments it. Returns null when another writer
   * won the race, which the caller treats as a conflict worth one retry.
   */
  compareAndSet(
    sessionId: string,
    expectedVersion: number,
    patch: SessionPatch,
  ): Promise<SessionRecord | null>;

  /** Moves stale CREATED or IN_PROGRESS sessions to EXPIRED. Returns how many were changed. */
  expireStaleBefore(cutoff: Date): Promise<number>;

  /** Best score per player, highest first. */
  leaderboard(limit: number): Promise<LeaderboardEntry[]>;

  /** Most recently finished games, newest first. */
  recentScores(limit: number): Promise<RecentScore[]>;
}

import type { Difficulty, ResponseKind, RoundOutcome, RoundStatus } from '../../domain/types';
import type { ResponseRecord, RoundRecord, SessionEventRecord } from './records';

export interface CreateRoundInput {
  sessionId: string;
  number: number;
  sequence: string[];
  difficulty: Difficulty;
  separator: string;
}

export interface CreateResponseInput {
  roundId: string;
  attemptSeq: number;
  kind: ResponseKind;
  transcriptRaw: string;
  normalizedTokens: string[];
  vocabTokens: string[];
  isCorrect: boolean | null;
  idempotencyKey: string;
  latencyMs: number | null;
  botInstanceId: string | null;
}

export interface EvaluateRoundPatch {
  outcome: RoundOutcome;
  pointsAwarded: number;
  answeredAt: Date;
  latencyMs: number | null;
  acceptedResponseId: string;
  presentedAt: Date;
}

export interface RoundRepository {
  /**
   * Creates the round, or returns the one another writer created first. Round numbers are unique
   * per session, so two bots asking for the next round at once still get the same round.
   */
  createIfAbsent(input: CreateRoundInput): Promise<{ created: boolean; round: RoundRecord }>;

  findById(roundId: string): Promise<RoundRecord | null>;

  /** The round the session is playing, if one is not scored yet. */
  findOpenForSession(sessionId: string): Promise<RoundRecord | null>;

  findBySessionAndNumber(sessionId: string, number: number): Promise<RoundRecord | null>;

  listForSession(sessionId: string): Promise<RoundRecord[]>;

  /** CREATED to AWAITING_ANSWER, idempotent: calling it twice keeps the first presentedAt. */
  markPresented(roundId: string, presentedAt: Date): Promise<RoundRecord | null>;

  /** Increments repeats and reopens the read-out. */
  markRepeated(roundId: string): Promise<RoundRecord | null>;

  /**
   * Scores a round only while it is still open (CREATED or AWAITING_ANSWER). Returns null when
   * another writer scored it first, which makes a concurrent submit a replay rather than a
   * second score.
   */
  evaluateIfOpen(
    roundId: string,
    openStatuses: readonly RoundStatus[],
    patch: EvaluateRoundPatch,
  ): Promise<RoundRecord | null>;
}

export interface ResponseRepository {
  /**
   * Inserts the attempt, or reports the one already stored under the same idempotency key.
   * `created: false` means a retry reached the database, so the caller must replay rather than
   * score again. The unique index does the work; this signal keeps that detail in the adapter.
   */
  createIfAbsent(
    input: CreateResponseInput,
  ): Promise<{ created: boolean; response: ResponseRecord }>;

  findByIdempotencyKey(key: string): Promise<ResponseRecord | null>;

  findById(responseId: string): Promise<ResponseRecord | null>;
}

export interface SessionEventRepository {
  record(
    sessionId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<SessionEventRecord>;
}

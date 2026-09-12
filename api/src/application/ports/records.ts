import type {
  Difficulty,
  EndReason,
  ResponseKind,
  RoundOutcome,
  RoundStatus,
  SessionStatus,
} from '../../domain/types';

/**
 * Plain shapes the use cases work with. They mirror prisma/schema.prisma but stay free of Prisma
 * types, so a use case can be tested against in-memory repositories.
 */

export interface PlayerRecord {
  id: string;
  name: string;
  nameKey: string;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  playerId: string;
  status: SessionStatus;
  score: number;
  roundsCleared: number;
  strikes: number;
  maxStrikes: number;
  maxRounds: number;
  currentRoundNumber: number;
  version: number;
  clientTokenHash: string;
  botInstanceId: string | null;
  endReason: EndReason | null;
  startedAt: Date | null;
  endedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundRecord {
  id: string;
  sessionId: string;
  number: number;
  sequence: string[];
  difficulty: Difficulty;
  separator: string;
  status: RoundStatus;
  outcome: RoundOutcome | null;
  repeats: number;
  pointsAwarded: number;
  presentedAt: Date | null;
  answeredAt: Date | null;
  latencyMs: number | null;
  acceptedResponseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResponseRecord {
  id: string;
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
  createdAt: Date;
}

export interface SessionEventRecord {
  id: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface SessionWithPlayer {
  session: SessionRecord;
  player: PlayerRecord;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  bestScore: number;
  bestRounds: number;
  achievedAt: Date;
}

export interface RecentScore {
  sessionId: string;
  playerName: string;
  score: number;
  roundsCleared: number;
  endedAt: Date;
  endReason: EndReason | null;
}

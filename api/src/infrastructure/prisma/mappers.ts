import type {
  GameSession,
  Player,
  Response as ResponseRow,
  Round,
  SessionEvent,
} from '@prisma/client';
import type {
  PlayerRecord,
  ResponseRecord,
  RoundRecord,
  SessionEventRecord,
  SessionRecord,
} from '../../application/ports/records';

/**
 * Prisma rows in, plain application records out. Keeping the translation here means the use cases
 * never see a Prisma type, so they can run against in-memory repositories in tests.
 */

export function toPlayerRecord(row: Player): PlayerRecord {
  return {
    id: row.id,
    name: row.name,
    nameKey: row.nameKey,
    createdAt: row.createdAt,
  };
}

export function toSessionRecord(row: GameSession): SessionRecord {
  return {
    id: row.id,
    playerId: row.playerId,
    status: row.status,
    score: row.score,
    roundsCleared: row.roundsCleared,
    strikes: row.strikes,
    maxStrikes: row.maxStrikes,
    maxRounds: row.maxRounds,
    currentRoundNumber: row.currentRoundNumber,
    version: row.version,
    clientTokenHash: row.clientTokenHash,
    botInstanceId: row.botInstanceId,
    endReason: row.endReason,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRoundRecord(row: Round): RoundRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    number: row.number,
    sequence: row.sequence,
    difficulty: row.difficulty,
    separator: row.separator,
    status: row.status,
    outcome: row.outcome,
    repeats: row.repeats,
    pointsAwarded: row.pointsAwarded,
    presentedAt: row.presentedAt,
    answeredAt: row.answeredAt,
    latencyMs: row.latencyMs,
    acceptedResponseId: row.acceptedResponseId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toResponseRecord(row: ResponseRow): ResponseRecord {
  return {
    id: row.id,
    roundId: row.roundId,
    attemptSeq: row.attemptSeq,
    kind: row.kind,
    transcriptRaw: row.transcriptRaw,
    normalizedTokens: row.normalizedTokens,
    vocabTokens: row.vocabTokens,
    isCorrect: row.isCorrect,
    idempotencyKey: row.idempotencyKey,
    latencyMs: row.latencyMs,
    botInstanceId: row.botInstanceId,
    createdAt: row.createdAt,
  };
}

export function toSessionEventRecord(row: SessionEvent): SessionEventRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

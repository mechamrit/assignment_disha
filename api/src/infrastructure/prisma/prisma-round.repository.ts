import { Prisma } from '@prisma/client';
import type {
  ResponseRecord,
  RoundRecord,
  SessionEventRecord,
} from '../../application/ports/records';
import type {
  CreateResponseInput,
  CreateRoundInput,
  EvaluateRoundPatch,
  ResponseRepository,
  RoundRepository,
  SessionEventRepository,
} from '../../application/ports/round.repository';
import type { RoundStatus } from '../../domain/types';
import { toResponseRecord, toRoundRecord, toSessionEventRecord } from './mappers';
import type { PrismaDb } from './prisma-db';

const UNIQUE_VIOLATION = 'P2002';

export class PrismaRoundRepository implements RoundRepository {
  constructor(private readonly db: PrismaDb) {}

  async create(input: CreateRoundInput): Promise<RoundRecord> {
    const row = await this.db.round.create({
      data: {
        sessionId: input.sessionId,
        number: input.number,
        sequence: input.sequence,
        difficulty: input.difficulty,
        separator: input.separator,
      },
    });
    return toRoundRecord(row);
  }

  async findById(roundId: string): Promise<RoundRecord | null> {
    const row = await this.db.round.findUnique({ where: { id: roundId } });
    return row ? toRoundRecord(row) : null;
  }

  async findOpenForSession(sessionId: string): Promise<RoundRecord | null> {
    const row = await this.db.round.findFirst({
      where: { sessionId, status: { in: ['CREATED', 'AWAITING_ANSWER'] } },
      orderBy: { number: 'desc' },
    });
    return row ? toRoundRecord(row) : null;
  }

  async findBySessionAndNumber(sessionId: string, number: number): Promise<RoundRecord | null> {
    const row = await this.db.round.findUnique({
      where: { sessionId_number: { sessionId, number } },
    });
    return row ? toRoundRecord(row) : null;
  }

  async listForSession(sessionId: string): Promise<RoundRecord[]> {
    const rows = await this.db.round.findMany({
      where: { sessionId },
      orderBy: { number: 'asc' },
    });
    return rows.map(toRoundRecord);
  }

  /** Idempotent: the guard on CREATED means a second call keeps the first presentedAt. */
  async markPresented(roundId: string, presentedAt: Date): Promise<RoundRecord | null> {
    await this.db.round.updateMany({
      where: { id: roundId, status: 'CREATED' },
      data: { status: 'AWAITING_ANSWER', presentedAt },
    });
    return this.findById(roundId);
  }

  /** Reopens the read-out and counts the repeat, which halves the points for the round. */
  async markRepeated(roundId: string): Promise<RoundRecord | null> {
    const result = await this.db.round.updateMany({
      where: { id: roundId, status: { in: ['CREATED', 'AWAITING_ANSWER'] } },
      data: { status: 'CREATED', repeats: { increment: 1 }, presentedAt: null },
    });
    if (result.count === 0) return null;
    return this.findById(roundId);
  }

  /**
   * Scores the round only while it is still open. A count of zero means another writer scored it
   * first, and the caller replays that verdict instead of adding points twice.
   */
  async evaluateIfOpen(
    roundId: string,
    openStatuses: readonly RoundStatus[],
    patch: EvaluateRoundPatch,
  ): Promise<RoundRecord | null> {
    const result = await this.db.round.updateMany({
      where: { id: roundId, status: { in: [...openStatuses] } },
      data: {
        status: 'EVALUATED',
        outcome: patch.outcome,
        pointsAwarded: patch.pointsAwarded,
        answeredAt: patch.answeredAt,
        latencyMs: patch.latencyMs,
        acceptedResponseId: patch.acceptedResponseId,
        presentedAt: patch.presentedAt,
      },
    });

    if (result.count === 0) return null;
    return this.findById(roundId);
  }
}

export class PrismaResponseRepository implements ResponseRepository {
  constructor(private readonly db: PrismaDb) {}

  async createIfAbsent(
    input: CreateResponseInput,
  ): Promise<{ created: boolean; response: ResponseRecord }> {
    try {
      const row = await this.db.response.create({
        data: {
          roundId: input.roundId,
          attemptSeq: input.attemptSeq,
          kind: input.kind,
          transcriptRaw: input.transcriptRaw,
          normalizedTokens: input.normalizedTokens,
          vocabTokens: input.vocabTokens,
          isCorrect: input.isCorrect,
          idempotencyKey: input.idempotencyKey,
          latencyMs: input.latencyMs,
          botInstanceId: input.botInstanceId,
        },
      });
      return { created: true, response: toResponseRecord(row) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (!existing) throw error;
      return { created: false, response: existing };
    }
  }

  async findByIdempotencyKey(key: string): Promise<ResponseRecord | null> {
    const row = await this.db.response.findUnique({ where: { idempotencyKey: key } });
    return row ? toResponseRecord(row) : null;
  }

  async findById(responseId: string): Promise<ResponseRecord | null> {
    const row = await this.db.response.findUnique({ where: { id: responseId } });
    return row ? toResponseRecord(row) : null;
  }
}

export class PrismaSessionEventRepository implements SessionEventRepository {
  constructor(private readonly db: PrismaDb) {}

  async record(
    sessionId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<SessionEventRecord> {
    const row = await this.db.sessionEvent.create({
      data: { sessionId, type, payload: payload as Prisma.InputJsonValue },
    });
    return toSessionEventRecord(row);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

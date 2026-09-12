import { Prisma } from '@prisma/client';
import type {
  LeaderboardEntry,
  RecentScore,
  SessionRecord,
  SessionWithPlayer,
} from '../../application/ports/records';
import type {
  CreateSessionInput,
  SessionPatch,
  SessionRepository,
} from '../../application/ports/session.repository';
import type { PrismaDb } from './prisma-db';
import { toPlayerRecord, toSessionRecord } from './mappers';

interface LeaderboardRow {
  playerId: string;
  playerName: string;
  bestScore: number;
  bestRounds: number;
  achievedAt: Date;
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: PrismaDb) {}

  async create(input: CreateSessionInput): Promise<SessionWithPlayer> {
    const player = await this.db.player.upsert({
      where: { nameKey: input.nameKey },
      update: { name: input.playerName },
      create: { name: input.playerName, nameKey: input.nameKey },
    });

    const session = await this.db.gameSession.create({
      data: {
        playerId: player.id,
        clientTokenHash: input.clientTokenHash,
        maxStrikes: input.maxStrikes,
        maxRounds: input.maxRounds,
      },
    });

    return { session: toSessionRecord(session), player: toPlayerRecord(player) };
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.db.gameSession.findUnique({ where: { id: sessionId } });
    return row ? toSessionRecord(row) : null;
  }

  async findWithPlayer(sessionId: string): Promise<SessionWithPlayer | null> {
    const row = await this.db.gameSession.findUnique({
      where: { id: sessionId },
      include: { player: true },
    });
    if (!row) return null;
    return { session: toSessionRecord(row), player: toPlayerRecord(row.player) };
  }

  /**
   * The session half of the no-double-score guarantee: the write lands only while `version` is
   * unchanged, so two concurrent scorers cannot both add points.
   */
  async compareAndSet(
    sessionId: string,
    expectedVersion: number,
    patch: SessionPatch,
  ): Promise<SessionRecord | null> {
    const result = await this.db.gameSession.updateMany({
      where: { id: sessionId, version: expectedVersion },
      data: { ...patch, version: { increment: 1 } },
    });

    if (result.count === 0) return null;
    return this.findById(sessionId);
  }

  async expireStaleBefore(cutoff: Date): Promise<number> {
    const result = await this.db.gameSession.updateMany({
      where: {
        status: { in: ['CREATED', 'IN_PROGRESS'] },
        lastActivityAt: { lt: cutoff },
      },
      data: {
        status: 'EXPIRED',
        endReason: 'EXPIRED',
        endedAt: new Date(),
        version: { increment: 1 },
      },
    });

    return result.count;
  }

  /** One row per player: their best completed game, highest score first. */
  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.db.$queryRaw<LeaderboardRow[]>(Prisma.sql`
      SELECT DISTINCT ON (s."playerId")
        s."playerId"          AS "playerId",
        p."name"              AS "playerName",
        s."score"             AS "bestScore",
        s."roundsCleared"     AS "bestRounds",
        COALESCE(s."endedAt", s."updatedAt") AS "achievedAt"
      FROM "GameSession" s
      JOIN "Player" p ON p."id" = s."playerId"
      WHERE s."status" = 'COMPLETED'
      ORDER BY s."playerId", s."score" DESC, s."endedAt" ASC
    `);

    return rows
      .map((row) => ({
        playerId: row.playerId,
        playerName: row.playerName,
        bestScore: Number(row.bestScore),
        bestRounds: Number(row.bestRounds),
        achievedAt: row.achievedAt,
      }))
      .sort((a, b) => b.bestScore - a.bestScore || a.achievedAt.getTime() - b.achievedAt.getTime())
      .slice(0, limit);
  }

  async recentScores(limit: number): Promise<RecentScore[]> {
    const rows = await this.db.gameSession.findMany({
      where: { endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      take: limit,
      include: { player: true },
    });

    return rows.map((row) => ({
      sessionId: row.id,
      playerName: row.player.name,
      score: row.score,
      roundsCleared: row.roundsCleared,
      endedAt: row.endedAt as Date,
      endReason: row.endReason,
    }));
  }
}

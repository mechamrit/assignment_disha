import type { GameConfig } from '../game-config';
import type { CachePort } from '../ports/cache.port';
import type { ClockPort } from '../ports/clock.port';
import type { IdempotencyClaim, IdempotencyPort } from '../ports/idempotency.port';
import type {
  LeaderboardEntry,
  PlayerRecord,
  RecentScore,
  ResponseRecord,
  RoundRecord,
  SessionEventRecord,
  SessionRecord,
  SessionWithPlayer,
} from '../ports/records';
import type {
  CreateResponseInput,
  CreateRoundInput,
  EvaluateRoundPatch,
  ResponseRepository,
  RoundRepository,
  SessionEventRepository,
} from '../ports/round.repository';
import type {
  CreateSessionInput,
  SessionPatch,
  SessionRepository,
} from '../ports/session.repository';
import type { RepositoryBundle, UnitOfWork } from '../ports/unit-of-work.port';
import type { RoundStatus } from '../../domain/types';

/**
 * In-memory doubles for the ports, with the same guarantees Postgres gives: version
 * compare-and-set on sessions, a status guard on scoring a round, and unique keys on responses
 * and round numbers.
 *
 * Every method yields once before touching state, so concurrent callers interleave the way they
 * would against a real database and the guards are genuinely exercised.
 */
const tick = (): Promise<void> => Promise.resolve();

export class InMemoryDb {
  players = new Map<string, PlayerRecord>();
  sessions = new Map<string, SessionRecord>();
  rounds = new Map<string, RoundRecord>();
  responses = new Map<string, ResponseRecord>();
  events: SessionEventRecord[] = [];
  private sequence = 0;

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

export class InMemorySessionRepository implements SessionRepository {
  constructor(private readonly db: InMemoryDb) {}

  async create(input: CreateSessionInput): Promise<SessionWithPlayer> {
    await tick();
    const now = new Date();

    const player: PlayerRecord = {
      id: this.db.nextId('player'),
      name: input.playerName,
      nameKey: input.nameKey,
      createdAt: now,
    };
    this.db.players.set(player.id, player);

    const session: SessionRecord = {
      id: this.db.nextId('session'),
      playerId: player.id,
      status: 'CREATED',
      score: 0,
      roundsCleared: 0,
      strikes: 0,
      maxStrikes: input.maxStrikes,
      maxRounds: input.maxRounds,
      currentRoundNumber: 0,
      version: 0,
      clientTokenHash: input.clientTokenHash,
      botInstanceId: null,
      endReason: null,
      startedAt: null,
      endedAt: null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.db.sessions.set(session.id, session);

    return { session, player };
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    await tick();
    return this.db.sessions.get(sessionId) ?? null;
  }

  async findWithPlayer(sessionId: string): Promise<SessionWithPlayer | null> {
    await tick();
    const session = this.db.sessions.get(sessionId);
    if (!session) return null;
    const player = this.db.players.get(session.playerId);
    if (!player) return null;
    return { session, player };
  }

  async compareAndSet(
    sessionId: string,
    expectedVersion: number,
    patch: SessionPatch,
  ): Promise<SessionRecord | null> {
    await tick();
    const current = this.db.sessions.get(sessionId);
    if (!current || current.version !== expectedVersion) return null;

    const updated: SessionRecord = {
      ...current,
      ...patch,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.db.sessions.set(sessionId, updated);
    return updated;
  }

  async expireStaleBefore(cutoff: Date): Promise<number> {
    await tick();
    let expired = 0;
    for (const [id, session] of this.db.sessions) {
      if (session.status !== 'CREATED' && session.status !== 'IN_PROGRESS') continue;
      if (session.lastActivityAt >= cutoff) continue;

      this.db.sessions.set(id, {
        ...session,
        status: 'EXPIRED',
        endReason: 'EXPIRED',
        endedAt: new Date(),
        version: session.version + 1,
      });
      expired += 1;
    }
    return expired;
  }

  async leaderboard(limit: number): Promise<LeaderboardEntry[]> {
    await tick();
    const best = new Map<string, LeaderboardEntry>();

    for (const session of this.db.sessions.values()) {
      if (session.status !== 'COMPLETED') continue;
      const player = this.db.players.get(session.playerId);
      if (!player) continue;

      const current = best.get(player.id);
      if (current && current.bestScore >= session.score) continue;

      best.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        bestScore: session.score,
        bestRounds: session.roundsCleared,
        achievedAt: session.endedAt ?? session.updatedAt,
      });
    }

    return [...best.values()].sort((a, b) => b.bestScore - a.bestScore).slice(0, limit);
  }

  async recentScores(limit: number): Promise<RecentScore[]> {
    await tick();
    return [...this.db.sessions.values()]
      .filter((session) => session.endedAt !== null)
      .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((session) => ({
        sessionId: session.id,
        playerName: this.db.players.get(session.playerId)?.name ?? 'player',
        score: session.score,
        roundsCleared: session.roundsCleared,
        endedAt: session.endedAt as Date,
        endReason: session.endReason,
      }));
  }
}

export class InMemoryRoundRepository implements RoundRepository {
  constructor(private readonly db: InMemoryDb) {}

  async createIfAbsent(input: CreateRoundInput): Promise<{ created: boolean; round: RoundRecord }> {
    await tick();
    const existing = [...this.db.rounds.values()].find(
      (round) => round.sessionId === input.sessionId && round.number === input.number,
    );
    if (existing) return { created: false, round: existing };

    const now = new Date();
    const round: RoundRecord = {
      id: this.db.nextId('round'),
      sessionId: input.sessionId,
      number: input.number,
      sequence: input.sequence,
      difficulty: input.difficulty,
      separator: input.separator,
      status: 'CREATED',
      outcome: null,
      repeats: 0,
      pointsAwarded: 0,
      presentedAt: null,
      answeredAt: null,
      latencyMs: null,
      acceptedResponseId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.rounds.set(round.id, round);
    return { created: true, round };
  }

  async findById(roundId: string): Promise<RoundRecord | null> {
    await tick();
    return this.db.rounds.get(roundId) ?? null;
  }

  async findOpenForSession(sessionId: string): Promise<RoundRecord | null> {
    await tick();
    return (
      [...this.db.rounds.values()]
        .filter((round) => round.sessionId === sessionId && round.status !== 'EVALUATED')
        .sort((a, b) => b.number - a.number)[0] ?? null
    );
  }

  async findBySessionAndNumber(sessionId: string, number: number): Promise<RoundRecord | null> {
    await tick();
    return (
      [...this.db.rounds.values()].find(
        (round) => round.sessionId === sessionId && round.number === number,
      ) ?? null
    );
  }

  async listForSession(sessionId: string): Promise<RoundRecord[]> {
    await tick();
    return [...this.db.rounds.values()]
      .filter((round) => round.sessionId === sessionId)
      .sort((a, b) => a.number - b.number);
  }

  async markPresented(roundId: string, presentedAt: Date): Promise<RoundRecord | null> {
    await tick();
    const round = this.db.rounds.get(roundId);
    if (!round) return null;
    if (round.status !== 'CREATED') return round;

    const updated: RoundRecord = { ...round, status: 'AWAITING_ANSWER', presentedAt };
    this.db.rounds.set(roundId, updated);
    return updated;
  }

  async markRepeated(roundId: string): Promise<RoundRecord | null> {
    await tick();
    const round = this.db.rounds.get(roundId);
    if (!round || round.status === 'EVALUATED') return null;

    const updated: RoundRecord = {
      ...round,
      status: 'CREATED',
      repeats: round.repeats + 1,
      presentedAt: null,
    };
    this.db.rounds.set(roundId, updated);
    return updated;
  }

  async evaluateIfOpen(
    roundId: string,
    openStatuses: readonly RoundStatus[],
    patch: EvaluateRoundPatch,
  ): Promise<RoundRecord | null> {
    await tick();
    const round = this.db.rounds.get(roundId);
    if (!round || !openStatuses.includes(round.status)) return null;

    const updated: RoundRecord = {
      ...round,
      status: 'EVALUATED',
      outcome: patch.outcome,
      pointsAwarded: patch.pointsAwarded,
      answeredAt: patch.answeredAt,
      latencyMs: patch.latencyMs,
      acceptedResponseId: patch.acceptedResponseId,
      presentedAt: patch.presentedAt,
      updatedAt: new Date(),
    };
    this.db.rounds.set(roundId, updated);
    return updated;
  }
}

export class InMemoryResponseRepository implements ResponseRepository {
  constructor(private readonly db: InMemoryDb) {}

  async createIfAbsent(
    input: CreateResponseInput,
  ): Promise<{ created: boolean; response: ResponseRecord }> {
    await tick();
    // Check and insert without yielding in between: this is the unique index.
    const existing = [...this.db.responses.values()].find(
      (response) => response.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { created: false, response: existing };

    const response: ResponseRecord = {
      id: this.db.nextId('response'),
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
      createdAt: new Date(),
    };
    this.db.responses.set(response.id, response);
    return { created: true, response };
  }

  async findByIdempotencyKey(key: string): Promise<ResponseRecord | null> {
    await tick();
    return (
      [...this.db.responses.values()].find((response) => response.idempotencyKey === key) ?? null
    );
  }

  async findById(responseId: string): Promise<ResponseRecord | null> {
    await tick();
    return this.db.responses.get(responseId) ?? null;
  }
}

export class InMemoryEventRepository implements SessionEventRepository {
  constructor(private readonly db: InMemoryDb) {}

  async record(
    sessionId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<SessionEventRecord> {
    await tick();
    const event: SessionEventRecord = {
      id: this.db.nextId('event'),
      sessionId,
      type,
      payload,
      createdAt: new Date(),
    };
    this.db.events.push(event);
    return event;
  }
}

export function inMemoryRepositories(db: InMemoryDb): RepositoryBundle {
  return {
    sessions: new InMemorySessionRepository(db),
    rounds: new InMemoryRoundRepository(db),
    responses: new InMemoryResponseRepository(db),
    events: new InMemoryEventRepository(db),
  };
}

/** Runs the work against the same repositories, with the one retry the Prisma adapter performs. */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly repos: RepositoryBundle) {}

  async run<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    try {
      return await work(this.repos);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'CasConflictError') throw error;
      return work(this.repos);
    }
  }
}

/** Redis stand-in. `alwaysClaim` models a cache that has been flushed or is unreachable. */
export class FakeIdempotency implements IdempotencyPort {
  private readonly slots = new Map<
    string,
    { state: 'in_flight' } | { state: 'done'; value: unknown }
  >();

  constructor(private readonly alwaysClaim = false) {}

  async begin<T>(key: string): Promise<IdempotencyClaim<T>> {
    await tick();
    if (this.alwaysClaim) return { state: 'claimed' };

    const slot = this.slots.get(key);
    if (!slot) {
      this.slots.set(key, { state: 'in_flight' });
      return { state: 'claimed' };
    }
    if (slot.state === 'in_flight') return { state: 'in_flight' };
    return { state: 'completed', value: slot.value as T };
  }

  async complete<T>(key: string, value: T): Promise<void> {
    await tick();
    if (this.alwaysClaim) return;
    this.slots.set(key, { state: 'done', value });
  }

  async release(key: string): Promise<void> {
    await tick();
    this.slots.delete(key);
  }
}

export class FakeCache implements CachePort {
  recentWords: string[] = [];
  sessions = new Map<string, unknown>();
  leaderboardWrites = 0;
  recentScoreWrites = 0;

  async readSession<T>(sessionId: string): Promise<T | null> {
    await tick();
    return (this.sessions.get(sessionId) as T | undefined) ?? null;
  }

  async writeSession<T>(sessionId: string, view: T): Promise<void> {
    await tick();
    this.sessions.set(sessionId, view);
  }

  async dropSession(sessionId: string): Promise<void> {
    await tick();
    this.sessions.delete(sessionId);
  }

  async readRecentWords(): Promise<string[]> {
    await tick();
    return this.recentWords;
  }

  async pushRecentWords(_playerId: string, words: readonly string[]): Promise<void> {
    await tick();
    this.recentWords = [...words, ...this.recentWords].slice(0, 60);
  }

  async readLeaderboard(): Promise<LeaderboardEntry[] | null> {
    await tick();
    return null;
  }

  async writeLeaderboard(): Promise<void> {
    await tick();
    this.leaderboardWrites += 1;
  }

  async recordLeaderboardResult(): Promise<void> {
    await tick();
    this.leaderboardWrites += 1;
  }

  async readRecentScores(): Promise<RecentScore[] | null> {
    await tick();
    return null;
  }

  async pushRecentScore(): Promise<void> {
    await tick();
    this.recentScoreWrites += 1;
  }

  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export const fixedClock: ClockPort = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
};

export const testGameConfig: GameConfig = {
  maxStrikes: 1,
  maxRounds: 15,
  sessionCacheTtlSeconds: 1800,
  idempotencyTtlSeconds: 3600,
  staleSessionMinutes: 10,
  strictMatch: false,
  botPublicUrl: 'http://localhost:7860',
};

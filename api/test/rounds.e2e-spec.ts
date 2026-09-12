import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { RedisService } from '../src/infrastructure/redis/redis.service';
import { body, type CreateSessionBody, type SessionViewBody } from './inject';

interface RoundBody {
  round: {
    id: string;
    number: number;
    sequence: string[];
    separator: string;
    status: string;
    repeats: number;
  };
  created?: boolean;
}

interface VerdictBody {
  replayed: boolean;
  roundId: string;
  roundNumber: number;
  correct: boolean;
  outcome: string;
  expected: string[];
  heardTokens: string[];
  points: { total: number };
  session: {
    score: number;
    roundsCleared: number;
    strikes: number;
    status: string;
    endReason: string | null;
  };
  gameOver: boolean;
  nextRound: { id: string; number: number; sequence: string[] } | null;
}

interface RoundHistoryBody {
  rounds: {
    number: number;
    length: number;
    status: string;
    outcome: string | null;
    pointsAwarded: number;
    sequence?: string[];
    heard?: string[];
  }[];
}

interface LeaderboardBody {
  entries: { rank: number; playerName: string; bestScore: number; bestRounds: number }[];
}

interface RecentScoresBody {
  scores: { sessionId: string; playerName: string; score: number; endReason: string | null }[];
}

/**
 * The round loop against real Postgres and Redis: draw a round, read it out, answer it, and prove
 * that a retried or raced answer is scored exactly once. These are the M3 checks in docs/PLAN.md.
 */
describe('rounds (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  const internalToken = process.env.INTERNAL_API_TOKEN ?? 'test-internal-token';
  const botInstanceId = 'bot-e2e';
  const playerName = `E2E rounds ${Date.now().toString(36)}`;

  let sessionId: string;
  let clientToken: string;

  const internal = { 'x-internal-token': internalToken };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const created = await app.inject({ method: 'POST', url: '/sessions', payload: { playerName } });
    const session = body<CreateSessionBody>(created);
    sessionId = session.sessionId;
    clientToken = session.clientToken;

    await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/attach`,
      headers: internal,
      payload: { clientToken, botInstanceId },
    });
  });

  afterAll(async () => {
    const nameKey = playerName.toLowerCase();
    try {
      await prisma.gameSession.deleteMany({ where: { player: { nameKey } } });
      await prisma.player.deleteMany({ where: { nameKey } });
    } finally {
      await app.close();
    }
  });

  const nextRound = async (): Promise<RoundBody> => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/rounds/next`,
      headers: internal,
      payload: { botInstanceId },
    });
    expect(res.statusCode).toBe(200);
    return body<RoundBody>(res);
  };

  const present = (roundId: string) =>
    app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/rounds/${roundId}/presented`,
      headers: internal,
      payload: { botInstanceId },
    });

  const answer = (roundId: string, attemptSeq: number, transcript: string) =>
    app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/rounds/${roundId}/answer`,
      headers: { ...internal, 'idempotency-key': `${roundId}:${attemptSeq}` },
      payload: { botInstanceId, attemptSeq, kind: 'ANSWER', transcript, latencyMs: 1200 },
    });

  const sessionView = async (): Promise<SessionViewBody> =>
    body<SessionViewBody>(await app.inject({ method: 'GET', url: `/sessions/${sessionId}` }));

  it('draws the first round and returns the same one when asked again', async () => {
    const first = await nextRound();
    expect(first.created).toBe(true);
    expect(first.round.number).toBe(1);
    expect(first.round.sequence).toHaveLength(3);

    const again = await nextRound();
    expect(again.created).toBe(false);
    expect(again.round.id).toBe(first.round.id);
  });

  it('marks the read-out as finished, and reports it again without moving the clock', async () => {
    const { round } = await nextRound();

    const first = await present(round.id);
    expect(first.statusCode).toBe(200);
    expect(body<RoundBody>(first).round.status).toBe('AWAITING_ANSWER');

    const stored = await prisma.round.findUnique({ where: { id: round.id } });
    await present(round.id);
    const after = await prisma.round.findUnique({ where: { id: round.id } });
    expect(after?.presentedAt?.toISOString()).toBe(stored?.presentedAt?.toISOString());
  });

  it('scores a correct answer and opens the next round', async () => {
    const { round } = await nextRound();
    const res = await answer(round.id, 1, round.sequence.join(' '));

    expect(res.statusCode).toBe(200);
    const verdict = body<VerdictBody>(res);
    expect(verdict).toMatchObject({
      replayed: false,
      correct: true,
      outcome: 'PASS',
      gameOver: false,
    });
    expect(verdict.points.total).toBeGreaterThan(0);
    expect(verdict.session.roundsCleared).toBe(1);
    expect(verdict.nextRound?.number).toBe(2);

    const view = await sessionView();
    expect(view.score).toBe(verdict.session.score);
    expect(view.currentRound?.number).toBe(2);
  });

  it('replays a retried answer instead of scoring it twice', async () => {
    const before = await sessionView();
    const round = await prisma.round.findFirst({
      where: { sessionId, number: 1 },
    });
    const res = await answer(round?.id ?? '', 1, 'anything at all');

    expect(res.statusCode).toBe(200);
    const verdict = body<VerdictBody>(res);
    expect(verdict.replayed).toBe(true);
    expect(verdict.roundNumber).toBe(1);

    const after = await sessionView();
    expect(after.score).toBe(before.score);
    expect(after.roundsCleared).toBe(before.roundsCleared);
  });

  it('accepts one answer when ten arrive at once, even with the cache emptied', async () => {
    const { round } = await nextRound();
    await present(round.id);

    // Drop every game key so the Redis fast path cannot be the thing that saves us.
    const keys = await redis.client.keys('mc:*');
    if (keys.length > 0) await redis.client.del(...keys);

    const before = await sessionView();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => answer(round.id, 1, round.sequence.join(' '))),
    );

    const verdicts = responses
      .filter((res) => res.statusCode === 200)
      .map((res) => body<VerdictBody>(res));
    const scored = verdicts.filter((verdict) => !verdict.replayed);
    const conflicts = responses.filter((res) => res.statusCode === 409);

    expect(scored).toHaveLength(1);
    expect(scored.length + verdicts.filter((v) => v.replayed).length + conflicts.length).toBe(10);

    const stored = await prisma.response.findMany({ where: { roundId: round.id } });
    expect(stored).toHaveLength(1);

    const after = await sessionView();
    expect(after.score).toBe(before.score + scored[0].points.total);
    expect(after.roundsCleared).toBe(before.roundsCleared + 1);
  });

  it('shows scored rounds in the history and keeps the open round hidden', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${sessionId}/rounds` });

    expect(res.statusCode).toBe(200);
    const history = body<RoundHistoryBody>(res);

    const scored = history.rounds.filter((round) => round.status === 'EVALUATED');
    expect(scored.length).toBeGreaterThanOrEqual(2);
    for (const round of scored) {
      expect(round.sequence).toHaveLength(round.length);
      expect(Array.isArray(round.heard)).toBe(true);
    }

    for (const round of history.rounds.filter((r) => r.status !== 'EVALUATED')) {
      expect(round.sequence).toBeUndefined();
      expect(round.length).toBeGreaterThan(0);
    }
  });

  it('ends the game on a wrong answer and publishes the result', async () => {
    const { round } = await nextRound();
    await present(round.id);

    const res = await answer(round.id, 1, 'apple zebra guitar');
    expect(res.statusCode).toBe(200);

    const verdict = body<VerdictBody>(res);
    expect(verdict).toMatchObject({ correct: false, gameOver: true, nextRound: null });
    expect(verdict.session).toMatchObject({ status: 'COMPLETED', endReason: 'FAILED', strikes: 1 });

    const view = await sessionView();
    expect(view.status).toBe('COMPLETED');
    expect(view.lastRound?.sequence).toEqual(verdict.expected);

    const leaderboard = body<LeaderboardBody>(
      await app.inject({ method: 'GET', url: '/leaderboard?limit=50' }),
    );
    expect(leaderboard.entries.some((entry) => entry.playerName === playerName)).toBe(true);

    const recent = body<RecentScoresBody>(
      await app.inject({ method: 'GET', url: '/scores/recent?limit=50' }),
    );
    expect(recent.scores.some((score) => score.sessionId === sessionId)).toBe(true);
  });

  it('refuses to score a round once the session has ended', async () => {
    const round = await prisma.round.findFirst({
      where: { sessionId },
      orderBy: { number: 'desc' },
    });
    const res = await answer(round?.id ?? '', 9, 'apple tiger piano');

    expect([409, 404]).toContain(res.statusCode);
  });
});

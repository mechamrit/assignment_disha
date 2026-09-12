import { OnSessionCompleted } from '../leaderboard/on-session-completed';
import { SubmitAnswer } from '../rounds/submit-answer';
import type { RepositoryBundle } from '../ports/unit-of-work.port';
import type { VerdictView } from '../views/verdict-view';
import {
  FakeCache,
  FakeIdempotency,
  fixedClock,
  inMemoryRepositories,
  InMemoryDb,
  InMemoryUnitOfWork,
  testGameConfig,
} from './fakes';

const SEQUENCE = ['apple', 'tiger', 'piano'];

interface Harness {
  db: InMemoryDb;
  repos: RepositoryBundle;
  cache: FakeCache;
  submit: SubmitAnswer;
  sessionId: string;
  roundId: string;
}

async function harness(options: { deadRedis?: boolean } = {}): Promise<Harness> {
  const db = new InMemoryDb();
  const repos = inMemoryRepositories(db);
  const cache = new FakeCache();
  const idempotency = new FakeIdempotency(options.deadRedis ?? false);

  const { session } = await repos.sessions.create({
    playerName: 'Asha',
    nameKey: 'asha',
    clientTokenHash: 'hash',
    maxStrikes: testGameConfig.maxStrikes,
    maxRounds: testGameConfig.maxRounds,
  });

  await repos.sessions.compareAndSet(session.id, session.version, {
    status: 'IN_PROGRESS',
    botInstanceId: 'bot-1',
    startedAt: fixedClock.now(),
    currentRoundNumber: 1,
  });

  const { round } = await repos.rounds.createIfAbsent({
    sessionId: session.id,
    number: 1,
    sequence: SEQUENCE,
    difficulty: 'EASY',
    separator: '. ',
  });
  await repos.rounds.markPresented(round.id, fixedClock.now());

  const submit = new SubmitAnswer(
    new InMemoryUnitOfWork(repos),
    repos,
    idempotency,
    cache,
    fixedClock,
    testGameConfig,
    new OnSessionCompleted(cache),
  );

  return { db, repos, cache, submit, sessionId: session.id, roundId: round.id };
}

function command(h: Harness, transcript = SEQUENCE.join(' ')) {
  return {
    sessionId: h.sessionId,
    roundId: h.roundId,
    botInstanceId: 'bot-1',
    attemptSeq: 1,
    kind: 'ANSWER' as const,
    transcript,
    latencyMs: 1500,
    idempotencyKey: `${h.roundId}:1`,
  };
}

describe('SubmitAnswer', () => {
  it('scores a correct answer once and opens the next round', async () => {
    const h = await harness();

    const verdict = await h.submit.execute(command(h));

    expect(verdict).toMatchObject({
      replayed: false,
      correct: true,
      outcome: 'PASS',
      gameOver: false,
    });
    expect(verdict.points.total).toBe(45);
    expect(verdict.session).toMatchObject({ score: 45, roundsCleared: 1, strikes: 0 });
    expect(verdict.nextRound?.number).toBe(2);
    expect(verdict.nextRound?.sequence).toHaveLength(4);
  });

  it('replays the same verdict for a retry with the same key, without scoring again', async () => {
    const h = await harness();

    const first = await h.submit.execute(command(h));
    const second = await h.submit.execute(command(h));

    expect(second.replayed).toBe(true);
    expect(second.roundId).toBe(first.roundId);
    expect(second.session.score).toBe(first.session.score);

    const session = await h.repos.sessions.findById(h.sessionId);
    expect(session?.score).toBe(45);
    expect(h.db.responses.size).toBe(1);
  });

  it('accepts exactly one of twenty concurrent submits of the same attempt', async () => {
    const h = await harness();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => h.submit.execute(command(h))),
    );

    const scored = results.filter(
      (result): result is PromiseFulfilledResult<VerdictView> =>
        result.status === 'fulfilled' && !result.value.replayed,
    );
    const rejectedCodes = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => (result.reason as { code?: string }).code);

    expect(scored).toHaveLength(1);
    for (const code of rejectedCodes) expect(code).toBe('IN_FLIGHT');

    const session = await h.repos.sessions.findById(h.sessionId);
    expect(session?.score).toBe(45);
    expect(session?.roundsCleared).toBe(1);
    expect(h.db.responses.size).toBe(1);

    const round = await h.repos.rounds.findById(h.roundId);
    expect(round?.status).toBe('EVALUATED');
    expect(round?.acceptedResponseId).toBeTruthy();
  });

  it('still scores only once when Redis never blocks a caller', async () => {
    const h = await harness({ deadRedis: true });

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => h.submit.execute(command(h))),
    );

    const scored = results.filter(
      (result): result is PromiseFulfilledResult<VerdictView> =>
        result.status === 'fulfilled' && !result.value.replayed,
    );

    expect(scored).toHaveLength(1);
    expect(h.db.responses.size).toBe(1);

    const session = await h.repos.sessions.findById(h.sessionId);
    expect(session?.score).toBe(45);
    expect(session?.roundsCleared).toBe(1);
  });

  it('ends the game on the first wrong answer and opens no next round', async () => {
    const h = await harness();

    const verdict = await h.submit.execute(command(h, 'apple piano tiger'));

    expect(verdict).toMatchObject({ correct: false, outcome: 'FAIL', gameOver: true });
    expect(verdict.points.total).toBe(0);
    expect(verdict.session).toMatchObject({
      score: 0,
      strikes: 1,
      status: 'COMPLETED',
      endReason: 'FAILED',
    });
    expect(verdict.nextRound).toBeNull();
    expect(h.cache.leaderboardWrites).toBeGreaterThan(0);
  });

  it('scores a timeout as a lost round', async () => {
    const h = await harness();

    const verdict = await h.submit.execute({ ...command(h, ''), kind: 'TIMEOUT' });

    expect(verdict).toMatchObject({ correct: false, outcome: 'TIMEOUT', gameOver: true });
    expect(verdict.session.strikes).toBe(1);
  });

  it('refuses to score chatter and leaves the round open', async () => {
    const h = await harness();

    await expect(h.submit.execute(command(h, 'can you say that again'))).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    const round = await h.repos.rounds.findById(h.roundId);
    expect(round?.status).toBe('AWAITING_ANSWER');
    expect(h.db.events.some((event) => event.type === 'CHATTER')).toBe(true);
  });

  it('refuses a bot that is no longer attached to the session', async () => {
    const h = await harness();

    await expect(h.submit.execute({ ...command(h), botInstanceId: 'bot-2' })).rejects.toMatchObject(
      { code: 'STALE_BOT' },
    );
  });
});

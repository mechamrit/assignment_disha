import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import {
  body,
  type AttachBody,
  type CreateSessionBody,
  type ErrorBody,
  type SessionViewBody,
} from './inject';

/**
 * The session lifecycle against real Postgres and Redis: create, read, attach the bot, end.
 * These are the M1 definition-of-done checks from docs/PLAN.md.
 */
describe('sessions (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const internalToken = process.env.INTERNAL_API_TOKEN ?? 'test-internal-token';
  const playerName = `E2E ${Date.now().toString(36)}`;

  let sessionId: string;
  let clientToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const nameKey = playerName.toLowerCase();
    try {
      // Sessions reference the player, so they go first; rounds, responses, and events cascade.
      await prisma.gameSession.deleteMany({ where: { player: { nameKey } } });
      await prisma.player.deleteMany({ where: { nameKey } });
    } finally {
      await app.close();
    }
  });

  it('rejects a nickname that is too short', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { playerName: 'a' },
    });

    expect(res.statusCode).toBe(400);
    expect(body<ErrorBody>(res)).toMatchObject({ statusCode: 400, code: 'VALIDATION' });
  });

  it('creates a session and returns the client token once', async () => {
    const res = await app.inject({ method: 'POST', url: '/sessions', payload: { playerName } });

    expect(res.statusCode).toBe(201);
    const created = body<CreateSessionBody>(res);
    expect(created).toMatchObject({
      status: 'CREATED',
      player: { name: playerName },
      config: { maxStrikes: expect.any(Number) as number, maxRounds: expect.any(Number) as number },
    });
    expect(created.bot.offerUrl).toMatch(/\/api\/offer$/);
    expect(typeof created.clientToken).toBe('string');

    sessionId = created.sessionId;
    clientToken = created.clientToken;
  });

  it('reads the session without leaking any sequence', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${sessionId}` });

    expect(res.statusCode).toBe(200);
    expect(body<SessionViewBody>(res)).toMatchObject({
      id: sessionId,
      status: 'CREATED',
      score: 0,
      currentRound: null,
      lastRound: null,
    });
    expect(res.body).not.toContain('sequence');
  });

  it('answers 404 for an unknown session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sessions/11111111-1111-1111-1111-111111111111',
    });

    expect(res.statusCode).toBe(404);
    expect(body<ErrorBody>(res)).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('refuses an internal call without the internal token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/attach`,
      payload: { clientToken, botInstanceId: 'bot-1' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('refuses an attach with the wrong client token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/attach`,
      headers: { 'x-internal-token': internalToken },
      payload: { clientToken: 'not-the-token', botInstanceId: 'bot-1' },
    });

    expect(res.statusCode).toBe(401);
    expect(body<ErrorBody>(res)).toMatchObject({ code: 'INVALID_CLIENT_TOKEN' });
  });

  it('attaches the bot, which starts the session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/attach`,
      headers: { 'x-internal-token': internalToken },
      payload: { clientToken, botInstanceId: 'bot-1' },
    });

    expect(res.statusCode).toBe(200);
    const attached = body<AttachBody>(res);
    expect(attached.session).toMatchObject({ id: sessionId, status: 'IN_PROGRESS' });
    expect(attached.vocabulary.keyterms.length).toBeGreaterThan(40);
    expect(attached.vocabulary.fillers).toContain('um');
    expect(attached.config.answerIdleSecs).toBeGreaterThan(0);
    expect(attached.currentRound).toBeNull();
  });

  it('shows the started session to the browser', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${sessionId}` });

    expect(res.statusCode).toBe(200);
    expect(body<SessionViewBody>(res)).toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: expect.any(String) as string,
    });
  });

  it('requires the client token to end a session', async () => {
    const missing = await app.inject({ method: 'POST', url: `/sessions/${sessionId}/end` });
    expect(missing.statusCode).toBe(400);

    const wrong = await app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/end`,
      headers: { 'x-client-token': 'not-the-token' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('ends the session, and ending it again is the same answer', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/end`,
      headers: { 'x-client-token': clientToken },
    });

    expect(first.statusCode).toBe(200);
    const ended = body<SessionViewBody>(first);
    expect(ended).toMatchObject({ status: 'COMPLETED', endReason: 'CLIENT_END' });

    const second = await app.inject({
      method: 'POST',
      url: `/sessions/${sessionId}/end`,
      headers: { 'x-client-token': clientToken },
    });

    expect(second.statusCode).toBe(200);
    expect(body<SessionViewBody>(second)).toMatchObject({
      status: 'COMPLETED',
      endReason: 'CLIENT_END',
      endedAt: ended.endedAt,
    });
  });

  it('refuses to attach a bot to a session that has ended', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/sessions/${sessionId}/attach`,
      headers: { 'x-internal-token': internalToken },
      payload: { clientToken, botInstanceId: 'bot-2' },
    });

    expect(res.statusCode).toBe(409);
    expect(body<ErrorBody>(res)).toMatchObject({ code: 'SESSION_ENDED' });
  });

  it('reports health with the database and cache reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(body<{ status: string; db: string; redis: string }>(res)).toMatchObject({
      status: 'ok',
      db: 'up',
      redis: 'ok',
    });
  });
});

import { Global, Module } from '@nestjs/common';
import { ENV, type Env, loadEnv } from '../config/env';
import { GAME_CONFIG, type GameConfig } from '../application/game-config';
import { CACHE } from '../application/ports/cache.port';
import { CLOCK, systemClock } from '../application/ports/clock.port';
import { ID } from '../application/ports/id.port';
import { IDEMPOTENCY } from '../application/ports/idempotency.port';
import { REPOSITORIES, UNIT_OF_WORK } from '../application/ports/unit-of-work.port';
import { CryptoIdAdapter } from '../infrastructure/crypto-id.adapter';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { PrismaUnitOfWork, repositoriesFor } from '../infrastructure/prisma/unit-of-work';
import { RedisCacheAdapter } from '../infrastructure/redis/redis-cache.adapter';
import { RedisIdempotencyAdapter } from '../infrastructure/redis/redis-idempotency.adapter';
import { RedisService } from '../infrastructure/redis/redis.service';

/**
 * The composition root: every port is bound to its adapter here, and nowhere else. Use cases only
 * ever see the tokens, which is what lets their tests swap in memory implementations.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: GAME_CONFIG,
      inject: [ENV],
      useFactory: (env: Env): GameConfig => ({
        maxStrikes: env.MAX_STRIKES,
        maxRounds: env.MAX_ROUNDS,
        sessionCacheTtlSeconds: env.SESSION_CACHE_TTL_SECONDS,
        idempotencyTtlSeconds: env.IDEMPOTENCY_TTL_SECONDS,
        staleSessionMinutes: env.STALE_SESSION_MINUTES,
        strictMatch: env.STRICT_MATCH,
        botPublicUrl: env.BOT_PUBLIC_URL,
      }),
    },
    PrismaService,
    {
      provide: RedisService,
      inject: [ENV],
      useFactory: (env: Env) => new RedisService(env.REDIS_URL),
    },
    { provide: CACHE, useClass: RedisCacheAdapter },
    { provide: IDEMPOTENCY, useClass: RedisIdempotencyAdapter },
    { provide: ID, useClass: CryptoIdAdapter },
    { provide: CLOCK, useValue: systemClock },
    {
      provide: REPOSITORIES,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => repositoriesFor(prisma),
    },
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
  ],
  exports: [
    ENV,
    GAME_CONFIG,
    PrismaService,
    RedisService,
    CACHE,
    IDEMPOTENCY,
    ID,
    CLOCK,
    REPOSITORIES,
    UNIT_OF_WORK,
  ],
})
export class InfraModule {}

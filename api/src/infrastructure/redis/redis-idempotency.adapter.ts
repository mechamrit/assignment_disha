import { Injectable, Logger } from '@nestjs/common';
import type { IdempotencyClaim, IdempotencyPort } from '../../application/ports/idempotency.port';
import { IN_FLIGHT_MARKER, redisKeys } from './keys';
import { RedisService } from './redis.service';

/**
 * Layer one of the no-double-score stack. It is a fast path only: when Redis is unavailable every
 * caller is told to proceed, and the unique index on Response.idempotencyKey plus the round status
 * check still make a retry a replay rather than a second score.
 */
@Injectable()
export class RedisIdempotencyAdapter implements IdempotencyPort {
  private readonly logger = new Logger(RedisIdempotencyAdapter.name);

  constructor(private readonly redis: RedisService) {}

  async begin<T>(key: string, inFlightTtlSeconds: number): Promise<IdempotencyClaim<T>> {
    const redisKey = redisKeys.idempotency(key);

    try {
      const claimed = await this.redis.client.set(
        redisKey,
        IN_FLIGHT_MARKER,
        'EX',
        inFlightTtlSeconds,
        'NX',
      );
      if (claimed === 'OK') return { state: 'claimed' };

      const existing = await this.redis.client.get(redisKey);
      if (existing === null) return { state: 'claimed' };
      if (existing === IN_FLIGHT_MARKER) return { state: 'in_flight' };

      return { state: 'completed', value: JSON.parse(existing) as T };
    } catch (error) {
      this.logger.warn(
        `idempotency begin failed, falling back to the database: ${(error as Error).message}`,
      );
      return { state: 'claimed' };
    }
  }

  async complete<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(
        redisKeys.idempotency(key),
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch (error) {
      this.logger.warn(`idempotency complete failed: ${(error as Error).message}`);
    }
  }

  async release(key: string): Promise<void> {
    try {
      await this.redis.client.del(redisKeys.idempotency(key));
    } catch (error) {
      this.logger.warn(`idempotency release failed: ${(error as Error).message}`);
    }
  }
}

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * The Redis connection, plus the rule that Redis never takes the request down with it: every
 * cache call goes through `safe`, which logs and falls back. Postgres is the source of truth.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn(`redis unavailable: ${error.message}`);
    });

    void this.client.connect().catch((error: Error) => {
      this.logger.warn(`redis connect failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Prefer a clean QUIT; fall back to dropping the socket when the connection is already gone.
    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }

  /** Runs a Redis call, returning `fallback` instead of throwing when Redis is unhappy. */
  async safe<T>(operation: () => Promise<T>, fallback: T, context: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.warn(`redis ${context} failed: ${(error as Error).message}`);
      return fallback;
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.safe(async () => (await this.client.ping()) === 'PONG', false, 'ping');
  }
}

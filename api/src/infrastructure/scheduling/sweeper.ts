import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExpireStaleSessions } from '../../application/sessions/expire-stale-sessions';

/** Runs the stale-session sweep every minute. */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);

  constructor(private readonly expireStaleSessions: ExpireStaleSessions) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const expired = await this.expireStaleSessions.execute();
      if (expired > 0) this.logger.log(`expired ${expired} stale session(s)`);
    } catch (error) {
      this.logger.error(`sweep failed: ${(error as Error).message}`);
    }
  }
}

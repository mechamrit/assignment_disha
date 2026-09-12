import { Inject, Injectable } from '@nestjs/common';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';

/**
 * Closes sessions nobody is playing any more. A browser tab closed mid-game leaves a session
 * IN_PROGRESS forever otherwise, which would keep it in the active set and out of the leaderboard.
 */
@Injectable()
export class ExpireStaleSessions {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
  ) {}

  /** Returns how many sessions were expired, for the scheduler to log. */
  async execute(): Promise<number> {
    const cutoff = new Date(
      this.clock.now().getTime() - this.config.staleSessionMinutes * 60 * 1000,
    );
    return this.repos.sessions.expireStaleBefore(cutoff);
  }
}

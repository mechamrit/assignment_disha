import { Inject, Injectable } from '@nestjs/common';
import { RoundNotFoundError } from '../../domain/errors';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { toRoundForBot, type RoundForBot } from '../sessions/attach-bot';
import { assertPlayableByBot } from './session-guards';

export interface MarkPresentedCommand {
  sessionId: string;
  roundId: string;
  botInstanceId: string;
}

/**
 * Marks the moment the read-out finished, which starts the answer clock. Idempotent: the bot may
 * report it again after a reconnect without moving `presentedAt`.
 */
@Injectable()
export class MarkPresented {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: MarkPresentedCommand): Promise<{ round: RoundForBot }> {
    const session = assertPlayableByBot(
      await this.repos.sessions.findById(command.sessionId),
      command.sessionId,
      command.botInstanceId,
    );

    const now = this.clock.now();
    const round = await this.repos.rounds.markPresented(command.roundId, now);
    if (!round) throw new RoundNotFoundError(command.roundId);

    await this.repos.sessions.compareAndSet(session.id, session.version, { lastActivityAt: now });
    await this.cache.dropSession(session.id);

    return { round: toRoundForBot(round) };
  }
}

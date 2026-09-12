import { Inject, Injectable } from '@nestjs/common';
import { SessionNotFoundError } from '../../domain/errors';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';

export interface RecordEventCommand {
  sessionId: string;
  botInstanceId: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * The bot's audit trail: commands, chatter, interruptions, nudges, and its own errors. Events are
 * write-only and never change the game, so this accepts them even from a replaced bot.
 */
@Injectable()
export class RecordEvent {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: RecordEventCommand): Promise<void> {
    const session = await this.repos.sessions.findById(command.sessionId);
    if (!session) throw new SessionNotFoundError(command.sessionId);

    await this.repos.events.record(session.id, command.type, {
      ...command.payload,
      botInstanceId: command.botInstanceId,
    });

    await this.repos.sessions.compareAndSet(session.id, session.version, {
      lastActivityAt: this.clock.now(),
    });
  }
}

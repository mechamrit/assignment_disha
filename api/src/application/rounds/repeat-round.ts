import { Inject, Injectable } from '@nestjs/common';
import { RoundNotOpenError } from '../../domain/errors';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { toRoundForBot, type RoundForBot } from '../sessions/attach-bot';
import { assertPlayableByBot } from './session-guards';

export type RepeatReason = 'REQUESTED' | 'INTERRUPTED';

export interface RepeatRoundCommand {
  sessionId: string;
  roundId: string;
  botInstanceId: string;
  reason: RepeatReason;
}

/**
 * Reopens a round for another read-out, either because the player asked or because the read-out
 * was cut off. Each repeat halves the points for that round, which the scorer applies.
 */
@Injectable()
export class RepeatRound {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: RepeatRoundCommand): Promise<{ round: RoundForBot }> {
    const session = assertPlayableByBot(
      await this.repos.sessions.findById(command.sessionId),
      command.sessionId,
      command.botInstanceId,
    );

    const round = await this.repos.rounds.markRepeated(command.roundId);
    if (!round) throw new RoundNotOpenError(command.roundId, 'EVALUATED');

    await this.repos.events.record(session.id, 'ROUND_REPEATED', {
      roundId: round.id,
      roundNumber: round.number,
      reason: command.reason,
      repeats: round.repeats,
    });

    await this.repos.sessions.compareAndSet(session.id, session.version, {
      lastActivityAt: this.clock.now(),
    });
    await this.cache.dropSession(session.id);

    return { round: toRoundForBot(round) };
  }
}

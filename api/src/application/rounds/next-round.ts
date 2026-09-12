import { Inject, Injectable } from '@nestjs/common';
import { ladderFor } from '../../domain/ladder';
import { generateSequence } from '../../domain/sequence';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { toRoundForBot, type RoundForBot } from '../sessions/attach-bot';
import { assertPlayableByBot } from './session-guards';

export interface NextRoundCommand {
  sessionId: string;
  botInstanceId: string;
}

export interface NextRoundResult {
  round: RoundForBot;
  /** False when a round was already waiting, so asking twice is safe. */
  created: boolean;
}

/**
 * Hands the bot the round to read out. If one is already open it comes back unchanged; otherwise
 * the next rung of the ladder is drawn, avoiding words this player heard recently.
 */
@Injectable()
export class NextRound {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: NextRoundCommand): Promise<NextRoundResult> {
    const session = assertPlayableByBot(
      await this.repos.sessions.findById(command.sessionId),
      command.sessionId,
      command.botInstanceId,
    );

    const open = await this.repos.rounds.findOpenForSession(session.id);
    if (open) return { round: toRoundForBot(open), created: false };

    const number = session.currentRoundNumber + 1;
    const step = ladderFor(number);
    const recentWords = new Set(await this.cache.readRecentWords(session.playerId));

    const { created, round } = await this.repos.rounds.createIfAbsent({
      sessionId: session.id,
      number,
      sequence: generateSequence(step, recentWords),
      difficulty: step.bucket,
      separator: step.separator,
    });

    if (created) {
      await this.repos.sessions.compareAndSet(session.id, session.version, {
        currentRoundNumber: number,
        lastActivityAt: this.clock.now(),
      });
      await this.cache.dropSession(session.id);
    }

    return { round: toRoundForBot(round), created };
  }
}

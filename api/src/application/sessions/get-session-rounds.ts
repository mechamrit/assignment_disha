import { Inject, Injectable } from '@nestjs/common';
import { SessionNotFoundError } from '../../domain/errors';
import type { RoundOutcome, RoundStatus } from '../../domain/types';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';

export interface RoundListItem {
  number: number;
  length: number;
  status: RoundStatus;
  outcome: RoundOutcome | null;
  repeats: number;
  pointsAwarded: number;
  /** Present only once the round has been scored; an open round keeps its words hidden. */
  sequence?: string[];
  heard?: string[];
}

/** The round history for a session, with the same anti-cheat rule as the session view. */
@Injectable()
export class GetSessionRounds {
  constructor(@Inject(REPOSITORIES) private readonly repos: RepositoryBundle) {}

  async execute(sessionId: string): Promise<RoundListItem[]> {
    const session = await this.repos.sessions.findById(sessionId);
    if (!session) throw new SessionNotFoundError(sessionId);

    const rounds = await this.repos.rounds.listForSession(sessionId);

    const items: RoundListItem[] = [];
    for (const round of rounds) {
      const item: RoundListItem = {
        number: round.number,
        length: round.sequence.length,
        status: round.status,
        outcome: round.outcome,
        repeats: round.repeats,
        pointsAwarded: round.pointsAwarded,
      };

      if (round.status === 'EVALUATED') {
        item.sequence = round.sequence;
        const accepted = round.acceptedResponseId
          ? await this.repos.responses.findById(round.acceptedResponseId)
          : null;
        item.heard = accepted?.vocabTokens ?? [];
      }

      items.push(item);
    }

    return items;
  }
}

import type { PlayerRecord, ResponseRecord, RoundRecord, SessionRecord } from '../ports/records';
import type { EndReason, RoundOutcome, RoundStatus, SessionStatus } from '../../domain/types';

/**
 * What a browser is allowed to know about a session. The sequence of an unfinished round is never
 * included: the player must remember the words, not read them.
 *
 * Dates are ISO strings so the view can be cached in Redis and returned unchanged.
 */
export interface SessionView {
  id: string;
  player: { name: string };
  status: SessionStatus;
  score: number;
  roundsCleared: number;
  strikes: number;
  maxStrikes: number;
  maxRounds: number;
  currentRound: {
    number: number;
    length: number;
    status: RoundStatus;
    repeats: number;
  } | null;
  lastRound: {
    number: number;
    sequence: string[];
    heard: string[];
    outcome: RoundOutcome;
    pointsAwarded: number;
  } | null;
  endReason: EndReason | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface SessionViewInput {
  session: SessionRecord;
  player: PlayerRecord;
  rounds: readonly RoundRecord[];
  /** Accepted response per round id, used to show what the player was heard saying. */
  acceptedResponses?: ReadonlyMap<string, ResponseRecord>;
}

export function buildSessionView(input: SessionViewInput): SessionView {
  const { session, player, rounds } = input;

  const open = [...rounds]
    .filter((round) => round.status !== 'EVALUATED')
    .sort((a, b) => b.number - a.number)[0];

  const lastEvaluated = [...rounds]
    .filter((round) => round.status === 'EVALUATED')
    .sort((a, b) => b.number - a.number)[0];

  const accepted =
    lastEvaluated?.acceptedResponseId !== undefined && lastEvaluated?.acceptedResponseId !== null
      ? input.acceptedResponses?.get(lastEvaluated.acceptedResponseId)
      : undefined;

  return {
    id: session.id,
    player: { name: player.name },
    status: session.status,
    score: session.score,
    roundsCleared: session.roundsCleared,
    strikes: session.strikes,
    maxStrikes: session.maxStrikes,
    maxRounds: session.maxRounds,
    currentRound: open
      ? {
          number: open.number,
          // Length only: the words stay on the server while the round is open.
          length: open.sequence.length,
          status: open.status,
          repeats: open.repeats,
        }
      : null,
    lastRound: lastEvaluated
      ? {
          number: lastEvaluated.number,
          sequence: lastEvaluated.sequence,
          heard: accepted?.vocabTokens ?? [],
          outcome: lastEvaluated.outcome ?? 'FAIL',
          pointsAwarded: lastEvaluated.pointsAwarded,
        }
      : null,
    endReason: session.endReason,
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    updatedAt: session.updatedAt.toISOString(),
  };
}

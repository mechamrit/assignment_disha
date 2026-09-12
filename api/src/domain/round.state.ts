import { InvalidTransitionError } from './errors';
import type { RoundStatus } from './types';

/**
 * A round is created, then read out (AWAITING_ANSWER), then scored once (EVALUATED).
 * Repeating a read-out moves it back to CREATED, which is why both open states accept an answer.
 */
export const ROUND_TRANSITIONS: Readonly<Record<RoundStatus, readonly RoundStatus[]>> =
  Object.freeze({
    CREATED: ['AWAITING_ANSWER', 'EVALUATED'],
    AWAITING_ANSWER: ['CREATED', 'EVALUATED'],
    EVALUATED: [],
  });

/** Statuses whose round can still accept an answer; the CAS in submit-answer guards on these. */
export const OPEN_ROUND_STATUSES: readonly RoundStatus[] = ['CREATED', 'AWAITING_ANSWER'];

export function isRoundOpen(status: RoundStatus): boolean {
  return OPEN_ROUND_STATUSES.includes(status);
}

export function canTransitionRound(from: RoundStatus, to: RoundStatus): boolean {
  return ROUND_TRANSITIONS[from].includes(to);
}

export function assertRoundTransition(from: RoundStatus, to: RoundStatus): void {
  if (!canTransitionRound(from, to)) {
    throw new InvalidTransitionError('round', from, to);
  }
}

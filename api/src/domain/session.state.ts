import { InvalidTransitionError } from './errors';
import type { EndReason, SessionStatus } from './types';

/** Allowed moves for a session. Anything not listed here is rejected before a write is attempted. */
export const SESSION_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> =
  Object.freeze({
    CREATED: ['IN_PROGRESS', 'ABANDONED', 'EXPIRED', 'COMPLETED'],
    IN_PROGRESS: ['COMPLETED', 'ABANDONED', 'EXPIRED'],
    COMPLETED: [],
    ABANDONED: [],
    EXPIRED: [],
  });

export const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = [
  'COMPLETED',
  'ABANDONED',
  'EXPIRED',
];

export function isTerminalSession(status: SessionStatus): boolean {
  return TERMINAL_SESSION_STATUSES.includes(status);
}

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransitionSession(from, to)) {
    throw new InvalidTransitionError('session', from, to);
  }
}

/**
 * Which end state a reason leads to. Finishing the game or quitting on purpose completes a
 * session; losing the connection or going quiet abandons it.
 */
export function statusForEndReason(reason: EndReason): SessionStatus {
  switch (reason) {
    case 'FAILED':
    case 'MAX_ROUNDS':
    case 'QUIT':
    case 'CLIENT_END':
      return 'COMPLETED';
    case 'DISCONNECTED':
    case 'IDLE_TIMEOUT':
      return 'ABANDONED';
    case 'EXPIRED':
      return 'EXPIRED';
  }
}

export interface GameOverInput {
  strikes: number;
  maxStrikes: number;
  roundsCleared: number;
  maxRounds: number;
}

/** The game ends on the first miss (with the default MAX_STRIKES) or after the last round. */
export function isGameOver(input: GameOverInput): boolean {
  return input.strikes >= input.maxStrikes || input.roundsCleared >= input.maxRounds;
}

export function endReasonForGameOver(input: GameOverInput): EndReason | null {
  if (input.strikes >= input.maxStrikes) return 'FAILED';
  if (input.roundsCleared >= input.maxRounds) return 'MAX_ROUNDS';
  return null;
}

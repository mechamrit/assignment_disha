import { InvalidTransitionError } from '../errors';
import {
  assertRoundTransition,
  canTransitionRound,
  isRoundOpen,
  OPEN_ROUND_STATUSES,
} from '../round.state';
import {
  assertSessionTransition,
  canTransitionSession,
  endReasonForGameOver,
  isGameOver,
  isTerminalSession,
  statusForEndReason,
} from '../session.state';
import { END_REASONS, ROUND_STATUSES, SESSION_STATUSES } from '../types';

describe('session state', () => {
  it('runs a session from created to completed', () => {
    expect(canTransitionSession('CREATED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionSession('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('never leaves a terminal status', () => {
    for (const status of SESSION_STATUSES.filter(isTerminalSession)) {
      for (const target of SESSION_STATUSES) {
        expect(canTransitionSession(status, target)).toBe(false);
      }
    }
  });

  it('throws on a move that is not allowed', () => {
    expect(() => assertSessionTransition('COMPLETED', 'IN_PROGRESS')).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertSessionTransition('CREATED', 'IN_PROGRESS')).not.toThrow();
  });

  it('maps every end reason to an end status', () => {
    for (const reason of END_REASONS) {
      expect(isTerminalSession(statusForEndReason(reason))).toBe(true);
    }
    expect(statusForEndReason('FAILED')).toBe('COMPLETED');
    expect(statusForEndReason('DISCONNECTED')).toBe('ABANDONED');
    expect(statusForEndReason('EXPIRED')).toBe('EXPIRED');
  });

  it('ends the game on the strike limit or the last round', () => {
    expect(isGameOver({ strikes: 1, maxStrikes: 1, roundsCleared: 0, maxRounds: 15 })).toBe(true);
    expect(isGameOver({ strikes: 0, maxStrikes: 1, roundsCleared: 15, maxRounds: 15 })).toBe(true);
    expect(isGameOver({ strikes: 0, maxStrikes: 1, roundsCleared: 3, maxRounds: 15 })).toBe(false);
  });

  it('names why the game ended', () => {
    expect(
      endReasonForGameOver({ strikes: 1, maxStrikes: 1, roundsCleared: 2, maxRounds: 15 }),
    ).toBe('FAILED');
    expect(
      endReasonForGameOver({ strikes: 0, maxStrikes: 1, roundsCleared: 15, maxRounds: 15 }),
    ).toBe('MAX_ROUNDS');
    expect(
      endReasonForGameOver({ strikes: 0, maxStrikes: 1, roundsCleared: 1, maxRounds: 15 }),
    ).toBe(null);
  });
});

describe('round state', () => {
  it('accepts an answer while a round is open', () => {
    expect(OPEN_ROUND_STATUSES).toEqual(['CREATED', 'AWAITING_ANSWER']);
    expect(isRoundOpen('CREATED')).toBe(true);
    expect(isRoundOpen('AWAITING_ANSWER')).toBe(true);
    expect(isRoundOpen('EVALUATED')).toBe(false);
  });

  it('allows a repeat to reopen the read-out but never reopens a scored round', () => {
    expect(canTransitionRound('AWAITING_ANSWER', 'CREATED')).toBe(true);
    for (const status of ROUND_STATUSES) {
      expect(canTransitionRound('EVALUATED', status)).toBe(false);
    }
  });

  it('throws when a scored round is moved again', () => {
    expect(() => assertRoundTransition('EVALUATED', 'AWAITING_ANSWER')).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertRoundTransition('CREATED', 'AWAITING_ANSWER')).not.toThrow();
  });
});

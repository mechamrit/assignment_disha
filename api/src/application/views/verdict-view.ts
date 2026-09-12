import type { EndReason, RoundOutcome, SessionStatus } from '../../domain/types';
import type { RoundForBot } from '../sessions/attach-bot';

/**
 * What the bot gets back for one answer. It carries every number the host may say out loud, so
 * the LLM never has to work anything out: the verdict is already decided here.
 */
export interface VerdictView {
  /** True when this answer was already scored and this is the stored result. */
  replayed: boolean;
  roundId: string;
  roundNumber: number;
  correct: boolean;
  outcome: RoundOutcome;
  expected: string[];
  heardRaw: string;
  heardTokens: string[];
  detail: {
    firstErrorIndex: number | null;
    missing: string[];
    extra: string[];
  };
  points: {
    base: number;
    speedBonus: number;
    streakBonus: number;
    repeatMultiplier: number;
    total: number;
  };
  session: {
    score: number;
    roundsCleared: number;
    strikes: number;
    maxStrikes: number;
    status: SessionStatus;
    endReason: EndReason | null;
  };
  gameOver: boolean;
  /** The next round to read out, or null when the game is over. */
  nextRound: RoundForBot | null;
}

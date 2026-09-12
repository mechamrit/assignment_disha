export interface ScoreInput {
  /** Number of words in the round. */
  length: number;
  /** How many times the sequence was read again; each repeat halves the points. */
  repeats: number;
  /** Time from the end of the read-out to the end of the answer. */
  latencyMs?: number | null;
  /** Rounds already cleared in this session, used for the streak bonus. */
  roundsClearedBefore: number;
  correct: boolean;
}

export interface ScoreBreakdown {
  base: number;
  speedBonus: number;
  streakBonus: number;
  repeatMultiplier: number;
  total: number;
}

export interface ScoreConfig {
  pointsPerWord: number;
  fastMs: number;
  fastBonusPerWord: number;
  briskMs: number;
  briskBonusPerWord: number;
  streakEvery: number;
  streakBonus: number;
  repeatMultiplier: number;
}

export const DEFAULT_SCORING: ScoreConfig = Object.freeze({
  pointsPerWord: 10,
  fastMs: 2000,
  fastBonusPerWord: 5,
  briskMs: 4000,
  briskBonusPerWord: 2,
  streakEvery: 3,
  streakBonus: 5,
  repeatMultiplier: 0.5,
});

const ZERO: ScoreBreakdown = Object.freeze({
  base: 0,
  speedBonus: 0,
  streakBonus: 0,
  repeatMultiplier: 1,
  total: 0,
});

/**
 * A wrong answer scores nothing. A correct one is the word count times ten, plus a speed bonus
 * for answering quickly and a streak bonus on every third cleared round, halved per repeat.
 */
export function scoreRound(input: ScoreInput, cfg: ScoreConfig = DEFAULT_SCORING): ScoreBreakdown {
  if (!input.correct) return { ...ZERO };

  const base = input.length * cfg.pointsPerWord;

  const latency = input.latencyMs ?? null;
  let speedBonus = 0;
  if (latency !== null && latency >= 0) {
    if (latency < cfg.fastMs) speedBonus = input.length * cfg.fastBonusPerWord;
    else if (latency < cfg.briskMs) speedBonus = input.length * cfg.briskBonusPerWord;
  }

  const cleared = input.roundsClearedBefore + 1;
  const streakBonus = cleared % cfg.streakEvery === 0 ? cfg.streakBonus : 0;

  const repeatMultiplier = cfg.repeatMultiplier ** Math.max(0, input.repeats);

  return {
    base,
    speedBonus,
    streakBonus,
    repeatMultiplier,
    total: Math.round((base + speedBonus + streakBonus) * repeatMultiplier),
  };
}

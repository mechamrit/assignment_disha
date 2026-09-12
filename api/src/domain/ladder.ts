import type { DifficultyBucket } from './vocabulary';

/** One rung of the difficulty ladder: how long round `round` is and which words it draws from. */
export interface LadderStep {
  round: number;
  length: number;
  bucket: DifficultyBucket;
  /** Spoken between words. The comma reads faster, which makes the hard rounds harder. */
  separator: string;
}

export interface LadderConfig {
  baseLength: number;
  maxLength: number;
  hardFromRound: number;
  easySeparator: string;
  hardSeparator: string;
}

export const DEFAULT_LADDER: LadderConfig = Object.freeze({
  baseLength: 2,
  maxLength: 12,
  hardFromRound: 5,
  easySeparator: '. ',
  hardSeparator: ', ',
});

/**
 * Round 1 is three words and grows by one word per round up to `maxLength`.
 * From `hardFromRound` the words come from the hard bucket and are read with shorter pauses.
 */
export function ladderFor(round: number, cfg: LadderConfig = DEFAULT_LADDER): LadderStep {
  if (!Number.isInteger(round) || round < 1) {
    throw new RangeError(`round must be a positive integer, got ${round}`);
  }

  const bucket: DifficultyBucket = round >= cfg.hardFromRound ? 'HARD' : 'EASY';

  return {
    round,
    length: Math.min(cfg.baseLength + round, cfg.maxLength),
    bucket,
    separator: bucket === 'HARD' ? cfg.hardSeparator : cfg.easySeparator,
  };
}

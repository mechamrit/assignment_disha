import type { LadderStep } from './ladder';
import { VOCABULARY } from './vocabulary';

/** Returns a float in [0, 1). Tests pass a seeded generator to get repeatable sequences. */
export type Rng = () => number;

/**
 * Picks `step.length` distinct words for a round.
 *
 * Words in `exclude` (the player's recent rounds) are skipped so sequences do not repeat across
 * a session. When the bucket is too small to honour that, the exclusion is relaxed rather than
 * failing: a repeat is better than a round that cannot be built.
 */
export function generateSequence(
  step: LadderStep,
  exclude: ReadonlySet<string> = new Set(),
  rng: Rng = Math.random,
): string[] {
  const bucket = VOCABULARY[step.bucket];

  if (step.length > bucket.length) {
    throw new RangeError(
      `round ${step.round} needs ${step.length} words but bucket ${step.bucket} has ${bucket.length}`,
    );
  }

  const preferred = bucket.filter((word) => !exclude.has(word));
  const pool = preferred.length >= step.length ? [...preferred] : [...bucket];

  const picked: string[] = [];
  while (picked.length < step.length) {
    const index = Math.floor(rng() * pool.length);
    const [word] = pool.splice(Math.min(index, pool.length - 1), 1);
    picked.push(word);
  }

  return picked;
}

export interface CompareResult {
  correct: boolean;
  /** First position where the answer diverges, or null when the order matched. */
  firstErrorIndex: number | null;
  /** Expected words the player did not say, counted with repeats. */
  missing: string[];
  /** Words the player said that the round did not ask for, counted with repeats. */
  extra: string[];
}

/**
 * Ordered, exact comparison: the player must say the same words in the same order.
 * Only vocabulary words reach this function, so "wait, it was apple" compares as "apple".
 */
export function compareSequences(
  expected: readonly string[],
  heard: readonly string[],
): CompareResult {
  const correct = expected.length === heard.length && expected.every((w, i) => w === heard[i]);

  let firstErrorIndex: number | null = null;
  const shared = Math.min(expected.length, heard.length);
  for (let i = 0; i < shared; i += 1) {
    if (expected[i] !== heard[i]) {
      firstErrorIndex = i;
      break;
    }
  }
  if (firstErrorIndex === null && expected.length !== heard.length) {
    firstErrorIndex = shared;
  }

  return {
    correct,
    firstErrorIndex,
    missing: multisetDifference(expected, heard),
    extra: multisetDifference(heard, expected),
  };
}

function multisetDifference(from: readonly string[], remove: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const word of remove) counts.set(word, (counts.get(word) ?? 0) + 1);

  const out: string[] = [];
  for (const word of from) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      counts.set(word, left - 1);
      continue;
    }
    out.push(word);
  }
  return out;
}

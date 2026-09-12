import { ladderFor } from '../ladder';
import { generateSequence, type Rng } from '../sequence';
import { EASY_WORDS, VOCABULARY } from '../vocabulary';

/** Small deterministic generator so a test can replay the exact same draw. */
function seeded(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateSequence', () => {
  it('returns the requested number of words from the round bucket', () => {
    const step = ladderFor(5);
    const sequence = generateSequence(step, new Set(), seeded(1));

    expect(sequence).toHaveLength(step.length);
    for (const word of sequence) {
      expect(VOCABULARY.HARD).toContain(word);
    }
  });

  it('never repeats a word inside one round', () => {
    for (let round = 1; round <= 10; round += 1) {
      const sequence = generateSequence(ladderFor(round), new Set(), seeded(round));
      expect(new Set(sequence).size).toBe(sequence.length);
    }
  });

  it('avoids words the player heard recently', () => {
    const step = ladderFor(1);
    const exclude = new Set<string>(EASY_WORDS.slice(0, 20));

    for (let seed = 0; seed < 50; seed += 1) {
      for (const word of generateSequence(step, exclude, seeded(seed))) {
        expect(exclude.has(word)).toBe(false);
      }
    }
  });

  it('relaxes the exclusion rather than failing when too few words are left', () => {
    const step = ladderFor(1);
    const exclude = new Set<string>(EASY_WORDS.slice(0, EASY_WORDS.length - 1));

    const sequence = generateSequence(step, exclude, seeded(7));

    expect(sequence).toHaveLength(step.length);
    expect(new Set(sequence).size).toBe(step.length);
  });

  it('is deterministic for a given generator', () => {
    const step = ladderFor(3);
    expect(generateSequence(step, new Set(), seeded(42))).toEqual(
      generateSequence(step, new Set(), seeded(42)),
    );
  });

  it('rejects a round longer than its bucket', () => {
    expect(() =>
      generateSequence({ round: 1, length: 999, bucket: 'EASY', separator: '. ' }, new Set()),
    ).toThrow(RangeError);
  });
});

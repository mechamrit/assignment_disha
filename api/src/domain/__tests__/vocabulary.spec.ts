import { withinOneEdit } from '../normalize';
import { ALL_WORDS, EASY_WORDS, FILLERS, HARD_WORDS, VOCABULARY } from '../vocabulary';

describe('vocabulary', () => {
  it('has at least 40 words in each bucket', () => {
    expect(EASY_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(HARD_WORDS.length).toBeGreaterThanOrEqual(40);
  });

  it('exposes both buckets and a flat list without duplicates', () => {
    expect(VOCABULARY.EASY).toBe(EASY_WORDS);
    expect(VOCABULARY.HARD).toBe(HARD_WORDS);
    expect(new Set(ALL_WORDS).size).toBe(ALL_WORDS.length);
  });

  it('uses plain lowercase letters only, so speech-to-text output can match directly', () => {
    for (const word of ALL_WORDS) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('keeps the buckets disjoint', () => {
    const easy = new Set<string>(EASY_WORDS);
    expect(HARD_WORDS.filter((word) => easy.has(word))).toEqual([]);
  });

  it('contains no pair of words within one edit of each other', () => {
    const confusable: string[] = [];
    for (let i = 0; i < ALL_WORDS.length; i += 1) {
      for (let j = i + 1; j < ALL_WORDS.length; j += 1) {
        if (withinOneEdit(ALL_WORDS[i], ALL_WORDS[j])) {
          confusable.push(`${ALL_WORDS[i]}/${ALL_WORDS[j]}`);
        }
      }
    }
    expect(confusable).toEqual([]);
  });

  it('never treats a real word as a filler', () => {
    expect(ALL_WORDS.filter((word) => FILLERS.has(word))).toEqual([]);
  });
});

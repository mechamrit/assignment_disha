import { compareSequences } from '../compare';

describe('compareSequences', () => {
  it('accepts the same words in the same order', () => {
    expect(compareSequences(['apple', 'tiger'], ['apple', 'tiger'])).toEqual({
      correct: true,
      firstErrorIndex: null,
      missing: [],
      extra: [],
    });
  });

  it('rejects a swapped order and points at the first difference', () => {
    const result = compareSequences(['apple', 'tiger', 'piano'], ['apple', 'piano', 'tiger']);
    expect(result.correct).toBe(false);
    expect(result.firstErrorIndex).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it('reports a missing word', () => {
    const result = compareSequences(['apple', 'tiger', 'piano'], ['apple', 'tiger']);
    expect(result.correct).toBe(false);
    expect(result.firstErrorIndex).toBe(2);
    expect(result.missing).toEqual(['piano']);
    expect(result.extra).toEqual([]);
  });

  it('reports an extra word', () => {
    const result = compareSequences(['apple', 'tiger'], ['apple', 'tiger', 'piano']);
    expect(result.correct).toBe(false);
    expect(result.firstErrorIndex).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['piano']);
  });

  it('reports a substitution on both sides', () => {
    const result = compareSequences(['apple', 'tiger'], ['apple', 'zebra']);
    expect(result.missing).toEqual(['tiger']);
    expect(result.extra).toEqual(['zebra']);
    expect(result.firstErrorIndex).toBe(1);
  });

  it('counts repeats as separate words', () => {
    const result = compareSequences(['apple', 'apple'], ['apple']);
    expect(result.missing).toEqual(['apple']);
    expect(result.extra).toEqual([]);
  });

  it('treats silence as every word missing', () => {
    const result = compareSequences(['apple', 'tiger'], []);
    expect(result.correct).toBe(false);
    expect(result.firstErrorIndex).toBe(0);
    expect(result.missing).toEqual(['apple', 'tiger']);
  });
});

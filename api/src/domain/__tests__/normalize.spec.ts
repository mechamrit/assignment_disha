import { normalizeTranscript, withinOneEdit } from '../normalize';

describe('withinOneEdit', () => {
  it.each([
    ['apple', 'apple', true],
    ['apple', 'aple', true],
    ['apple', 'apples', true],
    ['apple', 'ample', true],
    ['apple', 'amble', false],
    ['telescope', 'telescop', true],
    ['tiger', 'tigers', true],
    ['tiger', 'piano', false],
  ])('%s vs %s is %s', (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected);
    expect(withinOneEdit(b, a)).toBe(expected);
  });
});

describe('normalizeTranscript', () => {
  it('lowercases, strips punctuation, and keeps the spoken order', () => {
    const result = normalizeTranscript('Apple, Tiger, Piano.');
    expect(result.vocabTokens).toEqual(['apple', 'tiger', 'piano']);
  });

  it('drops filler words', () => {
    const result = normalizeTranscript('um apple uh tiger... so piano');
    expect(result.tokens).toEqual(['apple', 'tiger', 'piano']);
    expect(result.vocabTokens).toEqual(['apple', 'tiger', 'piano']);
  });

  it('merges a word that speech-to-text split in two', () => {
    expect(normalizeTranscript('water melon and light house').vocabTokens).toEqual([
      'watermelon',
      'lighthouse',
    ]);
  });

  it('folds plurals back to the vocabulary word', () => {
    expect(normalizeTranscript('apples tigers').vocabTokens).toEqual(['apple', 'tiger']);
  });

  it('snaps a near miss when the word is long enough', () => {
    expect(normalizeTranscript('telescop').vocabTokens).toEqual(['telescope']);
  });

  it('does not snap short words, where one edit changes the meaning', () => {
    expect(normalizeTranscript('lemo').vocabTokens).toEqual([]);
  });

  it('does not snap at all in strict mode', () => {
    expect(normalizeTranscript('telescop', { strict: true }).vocabTokens).toEqual([]);
    expect(normalizeTranscript('telescope', { strict: true }).vocabTokens).toEqual(['telescope']);
  });

  it('collapses a word the player repeated while thinking', () => {
    expect(normalizeTranscript('apple apple tiger').vocabTokens).toEqual(['apple', 'tiger']);
  });

  it('ignores words that are not in the vocabulary', () => {
    const result = normalizeTranscript('wait it was apple tiger piano');
    expect(result.vocabTokens).toEqual(['apple', 'tiger', 'piano']);
    expect(result.tokens).toContain('wait');
  });

  it('returns no vocabulary words for pure chatter', () => {
    expect(normalizeTranscript('can you say that again please').vocabTokens).toEqual([]);
  });

  it('keeps the raw transcript for the audit trail', () => {
    expect(normalizeTranscript('Apple!').raw).toBe('Apple!');
  });

  it('handles an empty transcript', () => {
    expect(normalizeTranscript('   ')).toEqual({ raw: '   ', tokens: [], vocabTokens: [] });
  });

  it('honours a restricted vocabulary', () => {
    const result = normalizeTranscript('apple tiger', { vocabulary: ['apple'] });
    expect(result.vocabTokens).toEqual(['apple']);
  });
});

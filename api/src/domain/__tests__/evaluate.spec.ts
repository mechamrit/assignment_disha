import { evaluateAnswer } from '../evaluate';

const round = {
  expected: ['apple', 'tiger', 'piano'],
  kind: 'ANSWER' as const,
  repeats: 0,
  roundsClearedBefore: 0,
};

describe('evaluateAnswer', () => {
  it('passes a clean answer', () => {
    const verdict = evaluateAnswer({
      ...round,
      transcript: 'apple, tiger, piano.',
      latencyMs: 1500,
    });

    expect(verdict.correct).toBe(true);
    expect(verdict.outcome).toBe('PASS');
    expect(verdict.points.total).toBe(45);
    expect(verdict.isChatter).toBe(false);
  });

  it('passes an answer buried in fillers and pauses', () => {
    const verdict = evaluateAnswer({ ...round, transcript: 'um apple tiger... so piano' });
    expect(verdict.correct).toBe(true);
  });

  it('passes an answer with a split word and a plural', () => {
    const verdict = evaluateAnswer({
      ...round,
      expected: ['watermelon', 'apple'],
      transcript: 'water melon, apples',
    });
    expect(verdict.correct).toBe(true);
  });

  it('fails a swapped order and reports where it diverged', () => {
    const verdict = evaluateAnswer({ ...round, transcript: 'apple piano tiger' });

    expect(verdict.correct).toBe(false);
    expect(verdict.outcome).toBe('FAIL');
    expect(verdict.detail.firstErrorIndex).toBe(1);
    expect(verdict.points.total).toBe(0);
  });

  it('fails an answer with an extra word', () => {
    const verdict = evaluateAnswer({ ...round, transcript: 'apple tiger piano zebra' });
    expect(verdict.correct).toBe(false);
    expect(verdict.detail.extra).toEqual(['zebra']);
  });

  it('marks a timeout without scoring it', () => {
    const verdict = evaluateAnswer({ ...round, transcript: '', kind: 'TIMEOUT' });
    expect(verdict.outcome).toBe('TIMEOUT');
    expect(verdict.correct).toBe(false);
    expect(verdict.points.total).toBe(0);
  });

  it('marks giving up as a failed round even if the words were said', () => {
    const verdict = evaluateAnswer({
      ...round,
      transcript: 'apple tiger piano',
      kind: 'GIVE_UP',
    });
    expect(verdict.outcome).toBe('FAIL');
    expect(verdict.correct).toBe(false);
  });

  it('flags chatter, which the caller must not score', () => {
    const verdict = evaluateAnswer({ ...round, transcript: 'can you repeat that please' });
    expect(verdict.isChatter).toBe(true);
    expect(verdict.correct).toBe(false);
  });

  it('keeps the raw transcript and the heard words for the audit trail', () => {
    const verdict = evaluateAnswer({ ...round, transcript: 'Apple! Tiger? Piano.' });
    expect(verdict.heardRaw).toBe('Apple! Tiger? Piano.');
    expect(verdict.vocabTokens).toEqual(['apple', 'tiger', 'piano']);
    expect(verdict.expected).toEqual(['apple', 'tiger', 'piano']);
  });

  it('halves the score after a repeat', () => {
    const verdict = evaluateAnswer({
      ...round,
      transcript: 'apple tiger piano',
      repeats: 1,
      latencyMs: 1500,
    });
    expect(verdict.points.total).toBe(23);
  });

  it('refuses a near miss in strict mode', () => {
    const strict = evaluateAnswer({
      ...round,
      expected: ['telescope'],
      transcript: 'telescop',
      strict: true,
    });
    expect(strict.correct).toBe(false);

    const lenient = evaluateAnswer({
      ...round,
      expected: ['telescope'],
      transcript: 'telescop',
    });
    expect(lenient.correct).toBe(true);
  });
});

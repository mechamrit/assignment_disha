import { DEFAULT_LADDER, ladderFor } from '../ladder';

describe('ladderFor', () => {
  it('starts at three easy words read with full stops', () => {
    expect(ladderFor(1)).toEqual({ round: 1, length: 3, bucket: 'EASY', separator: '. ' });
  });

  it('adds one word per round', () => {
    expect([1, 2, 3, 4].map((round) => ladderFor(round).length)).toEqual([3, 4, 5, 6]);
  });

  it('switches to the hard bucket and the faster separator from round 5', () => {
    expect(ladderFor(4).bucket).toBe('EASY');
    const hard = ladderFor(5);
    expect(hard.bucket).toBe('HARD');
    expect(hard.separator).toBe(', ');
  });

  it('caps the length so a round stays sayable', () => {
    expect(ladderFor(10).length).toBe(DEFAULT_LADDER.maxLength);
    expect(ladderFor(50).length).toBe(DEFAULT_LADDER.maxLength);
  });

  it('honours an overridden configuration', () => {
    const step = ladderFor(2, { ...DEFAULT_LADDER, hardFromRound: 2, baseLength: 1 });
    expect(step).toEqual({ round: 2, length: 3, bucket: 'HARD', separator: ', ' });
  });

  it('rejects a round number that is not a positive integer', () => {
    expect(() => ladderFor(0)).toThrow(RangeError);
    expect(() => ladderFor(-1)).toThrow(RangeError);
    expect(() => ladderFor(1.5)).toThrow(RangeError);
  });
});

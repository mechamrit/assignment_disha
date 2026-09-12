import { scoreRound } from '../score';

const base = { length: 3, repeats: 0, latencyMs: null, roundsClearedBefore: 0, correct: true };

describe('scoreRound', () => {
  it('scores ten points per word', () => {
    expect(scoreRound(base)).toMatchObject({ base: 30, total: 30 });
  });

  it('adds five points per word for a fast answer', () => {
    expect(scoreRound({ ...base, latencyMs: 1500 })).toMatchObject({ speedBonus: 15, total: 45 });
  });

  it('adds two points per word for a brisk answer', () => {
    expect(scoreRound({ ...base, latencyMs: 3000 })).toMatchObject({ speedBonus: 6, total: 36 });
  });

  it('adds no speed bonus for a slow answer', () => {
    expect(scoreRound({ ...base, latencyMs: 9000 })).toMatchObject({ speedBonus: 0, total: 30 });
  });

  it('adds a streak bonus on every third cleared round', () => {
    expect(scoreRound({ ...base, roundsClearedBefore: 2 }).streakBonus).toBe(5);
    expect(scoreRound({ ...base, roundsClearedBefore: 5 }).streakBonus).toBe(5);
    expect(scoreRound({ ...base, roundsClearedBefore: 1 }).streakBonus).toBe(0);
  });

  it('halves the points for each repeat of the read-out', () => {
    expect(scoreRound({ ...base, repeats: 1 })).toMatchObject({
      repeatMultiplier: 0.5,
      total: 15,
    });
    expect(scoreRound({ ...base, repeats: 2 })).toMatchObject({
      repeatMultiplier: 0.25,
      total: 8,
    });
  });

  it('combines the bonuses before halving', () => {
    expect(
      scoreRound({ length: 3, repeats: 1, latencyMs: 1500, roundsClearedBefore: 2, correct: true }),
    ).toMatchObject({ base: 30, speedBonus: 15, streakBonus: 5, total: 25 });
  });

  it('scores nothing for a wrong answer, however fast', () => {
    expect(scoreRound({ ...base, correct: false, latencyMs: 100 })).toEqual({
      base: 0,
      speedBonus: 0,
      streakBonus: 0,
      repeatMultiplier: 1,
      total: 0,
    });
  });

  it('ignores a negative latency instead of paying a bonus for it', () => {
    expect(scoreRound({ ...base, latencyMs: -5 }).speedBonus).toBe(0);
  });
});

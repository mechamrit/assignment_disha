/** Time as a dependency, so tests can freeze it instead of sleeping. */
export interface ClockPort {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: ClockPort = {
  now: () => new Date(),
};

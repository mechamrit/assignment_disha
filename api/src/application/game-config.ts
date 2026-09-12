/** Game settings the use cases need, read once from the environment at boot. */
export interface GameConfig {
  maxStrikes: number;
  maxRounds: number;
  sessionCacheTtlSeconds: number;
  idempotencyTtlSeconds: number;
  staleSessionMinutes: number;
  /** true compares exactly what was heard, with no fuzzy snapping. */
  strictMatch: boolean;
  /** Base URL of the voice bot runner, used to build the offer URL for the browser. */
  botPublicUrl: string;
}

export const GAME_CONFIG = Symbol('GAME_CONFIG');

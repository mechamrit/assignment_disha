/** Outcome of claiming an idempotency key. */
export type IdempotencyClaim<T> =
  /** This caller owns the slot and should do the work. */
  | { state: 'claimed' }
  /** The work finished earlier; replay this stored result. */
  | { state: 'completed'; value: T }
  /** Another caller holds the slot right now; retry shortly. */
  | { state: 'in_flight' };

/**
 * The fast path that stops a retried answer from being scored twice. It is an optimisation only:
 * the unique index on Response.idempotencyKey and the round status check still hold when Redis is
 * empty or unreachable.
 */
export interface IdempotencyPort {
  begin<T>(key: string, inFlightTtlSeconds: number): Promise<IdempotencyClaim<T>>;
  complete<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Frees the slot after a failure so the caller's retry can proceed. */
  release(key: string): Promise<void>;
}

export const IDEMPOTENCY = Symbol('IDEMPOTENCY');

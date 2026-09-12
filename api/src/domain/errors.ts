/**
 * Errors the domain and the use cases throw. The HTTP layer maps each one to
 * `{ statusCode, code, message, details? }` in infrastructure/http/filters/domain-error.filter.ts,
 * so `code` is part of the API contract in docs/PLAN.md.
 */

export type DomainErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ENDED'
  | 'INVALID_CLIENT_TOKEN'
  | 'STALE_BOT'
  | 'ROUND_NOT_FOUND'
  | 'ROUND_NOT_OPEN'
  | 'IN_FLIGHT'
  | 'INVALID_TRANSITION'
  | 'CONFLICT'
  | 'VALIDATION';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class SessionNotFoundError extends DomainError {
  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', 404, `Session ${sessionId} was not found`, { sessionId });
  }
}

export class SessionEndedError extends DomainError {
  constructor(sessionId: string, status: string) {
    super('SESSION_ENDED', 409, `Session ${sessionId} has ended`, { sessionId, status });
  }
}

export class InvalidClientTokenError extends DomainError {
  constructor(sessionId: string) {
    super('INVALID_CLIENT_TOKEN', 401, 'Client token does not match this session', { sessionId });
  }
}

export class StaleBotError extends DomainError {
  constructor(sessionId: string) {
    super('STALE_BOT', 409, 'Another bot instance is attached to this session', { sessionId });
  }
}

export class RoundNotFoundError extends DomainError {
  constructor(roundId: string) {
    super('ROUND_NOT_FOUND', 404, `Round ${roundId} was not found`, { roundId });
  }
}

export class RoundNotOpenError extends DomainError {
  constructor(roundId: string, status: string) {
    super('ROUND_NOT_OPEN', 409, `Round ${roundId} is not open for answers`, { roundId, status });
  }
}

/** The same idempotency key is being processed right now; the caller should retry shortly. */
export class InFlightError extends DomainError {
  constructor(idempotencyKey: string) {
    super('IN_FLIGHT', 409, 'That answer is still being scored', { idempotencyKey });
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super('INVALID_TRANSITION', 409, `${entity} cannot move from ${from} to ${to}`, {
      entity,
      from,
      to,
    });
  }
}

/**
 * A compare-and-set write matched no rows, so another writer won. The submit-answer use case
 * retries once before this reaches the caller.
 */
export class CasConflictError extends DomainError {
  constructor(entity: 'round' | 'session', id: string) {
    super('CONFLICT', 409, `${entity} ${id} changed while this write was in flight`, {
      entity,
      id,
    });
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', 400, message, details);
  }
}

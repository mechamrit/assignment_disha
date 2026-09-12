import type {
  ResponseRepository,
  RoundRepository,
  SessionEventRepository,
} from './round.repository';
import type { SessionRepository } from './session.repository';

/** The repositories a use case may touch, all bound to the same transaction when inside one. */
export interface RepositoryBundle {
  sessions: SessionRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  events: SessionEventRepository;
}

export interface UnitOfWork {
  /**
   * Runs `work` inside one serializable transaction. The adapter retries once when the database
   * reports a serialization failure, so `work` must be safe to run twice.
   */
  run<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
export const REPOSITORIES = Symbol('REPOSITORIES');

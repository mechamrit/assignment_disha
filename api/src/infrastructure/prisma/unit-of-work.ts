import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RepositoryBundle, UnitOfWork } from '../../application/ports/unit-of-work.port';
import { CasConflictError } from '../../domain/errors';
import type { PrismaDb } from './prisma-db';
import {
  PrismaResponseRepository,
  PrismaRoundRepository,
  PrismaSessionEventRepository,
} from './prisma-round.repository';
import { PrismaSessionRepository } from './prisma-session.repository';
import { PrismaService } from './prisma.service';

/** Postgres reports a failed serializable transaction with this Prisma error code. */
const SERIALIZATION_FAILURE = 'P2034';

const TRANSACTION_TIMEOUT_MS = 10_000;

export function repositoriesFor(db: PrismaDb): RepositoryBundle {
  return {
    sessions: new PrismaSessionRepository(db),
    rounds: new PrismaRoundRepository(db),
    responses: new PrismaResponseRepository(db),
    events: new PrismaSessionEventRepository(db),
  };
}

/**
 * Runs a use case inside one serializable transaction, with a single retry when the database or a
 * compare-and-set write says another writer got there first. One retry is enough: the second run
 * sees the committed state and takes the replay path instead of scoring again.
 */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    try {
      return await this.runOnce(work);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      return this.runOnce(work);
    }
  }

  private runOnce<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(repositoriesFor(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof CasConflictError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === SERIALIZATION_FAILURE;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /40001|could not serialize/i.test(error.message);
  }
  return false;
}

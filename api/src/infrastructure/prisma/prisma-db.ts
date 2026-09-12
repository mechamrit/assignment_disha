import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Either the root client or a transaction client. Repositories take this so the same code runs
 * inside and outside `unitOfWork.run()`.
 */
export type PrismaDb = PrismaClient | Prisma.TransactionClient;

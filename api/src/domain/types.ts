/**
 * Domain-level copies of the enums in prisma/schema.prisma. The domain never imports Prisma,
 * so these string unions are the shared vocabulary between the pure rules and the adapters.
 * Keep them in step with the schema; api/src/domain/__tests__/types.spec.ts pins the values.
 */

export type SessionStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

export type EndReason =
  'FAILED' | 'MAX_ROUNDS' | 'QUIT' | 'DISCONNECTED' | 'IDLE_TIMEOUT' | 'EXPIRED' | 'CLIENT_END';

export type RoundStatus = 'CREATED' | 'AWAITING_ANSWER' | 'EVALUATED';

export type RoundOutcome = 'PASS' | 'FAIL' | 'TIMEOUT';

export type ResponseKind =
  'ANSWER' | 'TIMEOUT' | 'GIVE_UP' | 'COMMAND' | 'CHATTER' | 'INTERRUPTION';

export type Difficulty = 'EASY' | 'HARD';

export const SESSION_STATUSES: readonly SessionStatus[] = [
  'CREATED',
  'IN_PROGRESS',
  'COMPLETED',
  'ABANDONED',
  'EXPIRED',
];

export const END_REASONS: readonly EndReason[] = [
  'FAILED',
  'MAX_ROUNDS',
  'QUIT',
  'DISCONNECTED',
  'IDLE_TIMEOUT',
  'EXPIRED',
  'CLIENT_END',
];

export const ROUND_STATUSES: readonly RoundStatus[] = ['CREATED', 'AWAITING_ANSWER', 'EVALUATED'];

export const ROUND_OUTCOMES: readonly RoundOutcome[] = ['PASS', 'FAIL', 'TIMEOUT'];

export const RESPONSE_KINDS: readonly ResponseKind[] = [
  'ANSWER',
  'TIMEOUT',
  'GIVE_UP',
  'COMMAND',
  'CHATTER',
  'INTERRUPTION',
];

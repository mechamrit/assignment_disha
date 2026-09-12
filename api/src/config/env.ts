import { z } from 'zod';

/**
 * Every environment variable the API reads, with its default. Parsing happens once at boot:
 * a missing or malformed value stops the process instead of failing later in a request.
 * Keep this list and api/.env.example in step.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  /** Shared secret the voice bot sends as X-Internal-Token on /internal routes. */
  INTERNAL_API_TOKEN: z.string().min(8, 'INTERNAL_API_TOKEN must be at least 8 characters'),

  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  BOT_PUBLIC_URL: z.string().min(1).default('http://localhost:7860'),

  SESSION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  STALE_SESSION_MINUTES: z.coerce.number().int().positive().default(10),

  MAX_STRIKES: z.coerce.number().int().positive().default(1),
  MAX_ROUNDS: z.coerce.number().int().positive().default(15),

  /** true compares exactly what was heard, with no fuzzy snapping of near misses. */
  STRICT_MATCH: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Injection token for the parsed environment. */
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }

  return parsed.data;
}

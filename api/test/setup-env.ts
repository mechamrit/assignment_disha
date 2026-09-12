import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Gives the e2e suite an environment without adding a dotenv dependency: values already in the
 * environment win, then api/.env, then defaults that match `make infra-up` on this machine.
 */
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(resolve(__dirname, '../.env'));

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://mc:mc@127.0.0.1:5432/memorycard',
  REDIS_URL: 'redis://127.0.0.1:6379',
  INTERNAL_API_TOKEN: 'test-internal-token',
  WEB_ORIGIN: 'http://localhost:5173',
  BOT_PUBLIC_URL: 'http://localhost:7860',
  LOG_LEVEL: 'silent',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

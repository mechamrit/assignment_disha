import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `api/.env` in development so `make api-dev` and the scripts work without exporting
 * variables by hand. Values already in the environment always win, and production is skipped
 * entirely: containers get real environment variables from compose.
 */
export function loadDotEnvFile(path: string = resolve(process.cwd(), '.env')): void {
  if (process.env.NODE_ENV === 'production') return;
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

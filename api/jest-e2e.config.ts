import type { Config } from 'jest';

/**
 * End-to-end suite: the real Nest app against the Postgres and Redis from `make infra-up`.
 * Run serially, because the tests share one database.
 */
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30_000,
};

export default config;

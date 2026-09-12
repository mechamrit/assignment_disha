// @ts-check
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/']),
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  prettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // src/domain stays pure: no framework, no I/O, and no imports from the outer layers.
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                '@prisma/*',
                'prisma',
                'ioredis',
                'pino',
                'nestjs-pino',
                'zod',
                '**/application/**',
                '**/infrastructure/**',
                '**/modules/**',
              ],
              message:
                'src/domain must stay pure: no Nest, Prisma, Redis, or outer-layer imports (docs/PLAN.md, ADR 0002).',
            },
          ],
        },
      ],
    },
  },
);

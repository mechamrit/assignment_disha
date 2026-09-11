---
paths:
  - "api/**"
---

# api rules

- Layers: `src/domain` (pure) ← `src/application` (use cases and ports) ← `src/infrastructure` (Prisma, Redis, HTTP, scheduling, logging). Imports point inward only. `src/modules/*.module.ts` are the only files that import from all three; they bind ports to adapters.
- `src/domain` imports nothing from `@nestjs/*`, `@prisma/client`, `ioredis`, or any I/O module: pure functions and data only.
- Application use cases depend on the port interfaces in `src/application/ports`. Their tests use in-memory ports. E2e tests (`test/*.e2e-spec.ts`) use real Postgres and Redis from compose.
- Anything that scores or changes session state runs through the `UnitOfWork` port (Serializable transaction, one retry on serialization or CAS failure). State changes use `updateMany` guarded by status or `version`, and `count === 0` is a conflict.
- Redis is write-through after commit. Wrap every cache call; a Redis error degrades to the DB path and never fails the request.
- Errors: throw `DomainError` subclasses. `infrastructure/http/filters/domain-error.filter.ts` maps them to `{ statusCode, code, message, details? }`.
- Schema change: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` in `api/`, commit the migration, then `make contracts-emit` if DTOs changed.
- Endpoint or DTO change: `make contracts-emit`, then commit `contracts/openapi.json` and the generated clients in the same commit.
- New env variable: add it to the zod schema in `src/config/env.ts` and to `api/.env.example`.
- ESLint uses the flat config `api/eslint.config.mjs` (ESLint 10 has no `.eslintrc`). Prettier runs through ESLint.
- Tests: `npm run test -w api`; one file `npm run test -w api -- src/path/file.spec.ts`; by name `-- -t "name"`.

# api

NestJS 11 game API on the Fastify adapter. It is the system of record: sessions, rounds, responses, scores, and the leaderboard live here, and it is the only component that validates an answer or changes a score. It never handles audio and never calls an LLM.

Who calls it:
- `web` uses the public endpoints (`/sessions`, `/scores`, `/leaderboard`, `/health`).
- `voice-bot` uses the internal endpoints (`/internal/...`, authenticated with `X-Internal-Token`) on every turn.

Endpoints, payloads, and error codes are specified under "API contract" in `docs/PLAN.md`. `contracts/openapi.json` is generated from this app.

## Commands

From the repo root, after `nvm use`:

| Command | Does |
|---|---|
| `make api-dev` | Watch mode on http://localhost:4000 (`nest start --watch`); restarts when a source file's content changes |
| `npm run test -w api` | Jest unit tests (`src/**/*.spec.ts`) |
| `npm run lint -w api` | ESLint with type-aware rules and Prettier; any warning fails |
| `npm run typecheck -w api` | `tsc --noEmit` over sources, tests, scripts, and the Jest config |
| `npm run build -w api` | Compile `src/` into `dist/` |
| `npm run start -w api` | Run the compiled `dist/main.js` |
| `npm run db:generate -w api` | Generate the Prisma client (needed after a clone or a schema change) |
| `make db-migrate` | Create and apply a migration from `prisma/schema.prisma` |
| `npm run db:deploy -w api` | Apply existing migrations, for containers and CI |
| `npm run test:e2e -w api` | End-to-end suite against the Postgres and Redis from `make infra-up` |
| `make contracts-emit` | Write the Swagger document to `contracts/openapi.json` |
| `docker compose --profile full up -d --build api` | Rebuild the image and run the container next to Postgres and Redis |

## Source layout

Files in this tree:

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap: Fastify adapter, listens on `0.0.0.0:$PORT` (default 4000), shutdown hooks so `SIGTERM` closes the app cleanly |
| `src/app.module.ts` | Root module; feature modules are imported here |
| `src/__tests__/app.module.spec.ts` | Boots the root module on Fastify in-process and checks that a request is routed through Nest |

Target layers from `docs/PLAN.md` (a folder appears with its first file):

| Folder | Holds | May import |
|---|---|---|
| `src/domain/` | Pure game rules: vocabulary, ladder, normalization, comparison, scoring, state guards | only `domain/` |
| `src/application/` | Use cases and the port interfaces they depend on (repositories, cache, idempotency, clock, ids) | `domain/` |
| `src/infrastructure/` | Adapters: Prisma, Redis, HTTP controllers and DTOs, guards, filters, scheduler, logging | `application/`, `domain/` |
| `src/modules/` | Nest modules that bind ports to adapters | all layers |
| `prisma/` | Schema, migrations, seed | |
| `test/` | E2e specs against real Postgres and Redis | |

The full rule set for these layers is `.claude/rules/api.md`.

## Configuration

`api/.env.example` lists every variable. How each run gets them:

- Outside production the app loads `api/.env` at startup (`src/config/dotenv.ts`), so `make api-dev`, the OpenAPI emitter, and the e2e suite work without exporting anything. Variables already in the environment win (`PORT=4001 make api-dev`).
- The compose `api` container runs with `NODE_ENV=production`, which skips that file loading. Compose passes `api/.env` through `env_file` and sets `PORT`, `DATABASE_URL`, and `REDIS_URL` to the service names itself.

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port (4000) |
| `DATABASE_URL` | Postgres connection string; from the host, use the host port set in the root `.env` |
| `REDIS_URL` | Redis connection string; from the host, use the host port set in the root `.env` |
| `INTERNAL_API_TOKEN` | Shared secret the bot sends as `X-Internal-Token` |
| `WEB_ORIGIN` | CORS origin allowed on the public endpoints |
| `BOT_PUBLIC_URL` | Bot runner base URL; `POST /sessions` returns the offer URL built from it |
| `SESSION_CACHE_TTL_SECONDS` | Sliding TTL of the cached session view |
| `IDEMPOTENCY_TTL_SECONDS` | How long a stored verdict replays for the same idempotency key |
| `STALE_SESSION_MINUTES` | Inactivity after which the sweeper expires a session |
| `MAX_STRIKES`, `MAX_ROUNDS` | Game-over limits |
| `STRICT_MATCH` | `true` turns off fuzzy snapping of misheard words |
| `LOG_LEVEL` | Log level |

The code in this tree reads only `PORT`. The others belong to the typed config schema (`src/config/env.ts` in the plan).

## Tests

- Unit tests sit under `__tests__/` next to the code they cover and end in `.spec.ts`. Jest runs them from `src/` through ts-jest.
- Use cases are tested against in-memory ports. Anything that needs Postgres or Redis is an e2e test in `test/`.
- One file: `npm run test -w api -- src/__tests__/app.module.spec.ts`. By name: `npm run test -w api -- -t "404"`.

## Docker

`api/Dockerfile` builds from the repo root because the workspace lockfile lives there. The build stage installs the api workspace and compiles. The runtime stage installs production dependencies only and runs `node dist/main.js` as the unprivileged `node` user on port 4000. Compose publishes it on 127.0.0.1:4000, and `docker compose stop api` shuts it down cleanly through the shutdown hooks.

## Dependency notes

- Every version is an exact pin (`.npmrc` sets `save-exact`). The root `package.json` overrides `fastify` to 5.12.4 because `@nestjs/platform-fastify` 11.2.3 pins a fastify release with two published advisories.
- ESLint uses the flat config `eslint.config.mjs`; ESLint 10 has no `.eslintrc` support.

Milestone: M1 and M2 done        Done: M0 fe54682, then the M0 hardening, M2, and M1 commits of this session (`git log --oneline`)
Now: The API is a working system of record. Postgres schema with the first migration, zod-validated env, ports with Prisma and Redis adapters, a serializable UnitOfWork that retries once, pino logging, Swagger at /docs, contracts/openapi.json emitted and committed, the session lifecycle (create, read, attach bot, end, expire stale), the internal-token guard, a per-minute sweeper, and rate limiting on session creation. The pure domain rules (vocabulary, ladder, sequence generator, normalizer, comparer, scoring, evaluator, state machines) carry 75 unit tests, and an ESLint rule blocks framework imports inside src/domain. web and voice-bot are unchanged from M0.
Next action: M3. Round use cases (next-round, mark-presented, submit-answer, repeat-round, record-event) with the Redis idempotency fast path, plus leaderboard and recent scores and their endpoints. Then the concurrency proof: 20 parallel submits accept exactly one, a same-key replay returns the identical verdict with the score unchanged, and the same race against real Postgres with Redis flushed mid-test.
Blocked: the browser voice client. @pipecat-ai/small-webrtc-transport depends on @daily-co/daily-js, which requires Node 22.14 from 0.89.0 on, so on Node 20 only the older set installs (client-js 1.6.x with transport 1.9.0) and its RTVI protocol may not match Python pipecat 1.9.0. Decide before M8: move the repo to Node 22, pin the older client set, or drop engine-strict. Nothing else depends on this.
Last verified:
- make ci: exit 0 (api 75 unit tests, web vitest, bot 20 pytest, api and web builds)
- api e2e, 2 suites and 15 tests against the compose Postgres and Redis: create 201, the session view hides every sequence, unknown id 404, internal call without the token 401, wrong client token 401, attach 200 and the session becomes IN_PROGRESS, end 200 and ending again returns the same endedAt, attach after end 409 SESSION_ENDED, /docs 200, /docs-json lists only the four public paths, health 200 with db up and redis ok
- prisma migrate dev wrote the init migration; Postgres holds Player, GameSession, Round, Response, SessionEvent
- make contracts-emit writes contracts/openapi.json: POST /sessions 201,400; GET /sessions/{id} 200,404; POST /sessions/{id}/end 200,401; GET /health 200,503
- actionlint 1.7.12 clean on the api-e2e and contracts-check jobs
- the e2e suite leaves no rows behind and jest exits on its own
Notes:
- Prisma is pinned to 6.19.3: the 8.0.0 release candidate requires Node 22.18, and Prisma 7 needs 20.19 or newer.
- nestjs-pino is pinned to 4.6.1 with pino 9 for the same reason: version 5 requires Node 22.12.
- A fresh clone needs `npm run db:generate -w api` before typecheck, tests, or build; `npm ci` does not generate the Prisma client.
- Outside production the API loads api/.env at startup, so `make api-dev`, the OpenAPI emitter, and the e2e suite need no exported variables.
- Root package.json overrides fastify to 5.12.4. @nestjs/platform-fastify 11.2.3 pins fastify 5.11.3, which is affected by GHSA-w2qp-rph6-63g4 and GHSA-3m5p-2c4r-xxw2 (fixed in 5.12.1).
- The allow list in .claude/settings.json is narrower than the sketch in docs/PLAN.md: `curl -s http://localhost*` and `uv run *` both match commands that reach other hosts or run any program.
- postgres:16-alpine and redis:7-alpine stay floating tags as specified for M0; every other image is pinned to a patch version.
- Node 20 is past end of life (April 2026). The plan pins it; Vite 8 and ESLint 10 need 20.19 or newer.
- Until the workspace trust dialog is accepted once in an interactive session here, Claude Code ignores permissions.allow from .claude/settings.json. Hooks and deny rules still apply.
Env: Node 20 via nvm (`nvm use`). Docker via Colima. On this machine the root .env sets REDIS_HOST_PORT=6380 because Homebrew redis owns 6379, and api/.env points DATABASE_URL and REDIS_URL at 127.0.0.1:5432 and 127.0.0.1:6380 (see CLAUDE.local.md). Provider keys (voice-bot/.env) are first needed in M4.

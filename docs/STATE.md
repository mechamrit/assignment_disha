Milestone: M0 done        Done: M0 (commit "feat(m0): scaffold")
Now: Scaffold only, no game code. api: NestJS 11.2.3 on Fastify with an empty AppModule (every route answers 404). web: Vite 8, React 18.3.1, Tailwind 3.4, one heading. voice-bot: uv project, pipecat-ai 1.9.0 with extras locked in uv.lock, no bot.py. Compose: postgres and redis; profile full builds api, web, and bot images.
Unavailable make targets (print the missing file, exit 1): db-migrate, contracts-emit, contracts-check (M1); bot-dev (M4); demo (M9).
Next action: M1. Write api/src/config/env.ts (zod) and api/prisma/schema.prisma from PLAN "Data model", run the first migration against compose Postgres, and replace the db-migrate recipe. Then wire contracts-emit and contracts-check, and add the api e2e job (postgres and redis services) and the contracts-check job to ci.yml and `make ci`.
Blocked: none
Last verified (M0 tree):
- docker compose up -d: postgres 16.15 (healthy), redis 7.4.11 (healthy)
- CI lint job, its run: steps from ci.yml executed locally (npm ci, uv sync --locked, make lint): exit 0
- make ci: exit 0 (jest 1 passed, vitest 1 passed, pytest 20 passed, api and web builds)
- uv sync: Python 3.11.15, 120 packages; pytest resolves every Pipecat import in PLAN "Key code shape", LocalSmartTurnAnalyzerV3 included, with no extra beyond the pinned set
- actionlint 1.7.12 on ci.yml: no findings
- compose profile full: api and web images build and answer HTTP (404 JSON, 200 page); bot image builds (Python 3.11.15, pipecat-ai 1.9.0) and its CMD fails with `Failed to spawn: bot.py` (bot.py is M4)
- fresh `claude -p "/context"` from the repo root, Memory Files: ~/.claude/CLAUDE.md, CLAUDE.md, docs/STATE.md, CLAUDE.local.md (same four in an InstructionsLoaded hook log; rules load only on path match)
- npm audit: 0 vulnerabilities
Notes:
- Root package.json overrides fastify to 5.12.4. @nestjs/platform-fastify 11.2.3 pins fastify 5.11.3, which is affected by GHSA-w2qp-rph6-63g4 and GHSA-3m5p-2c4r-xxw2 (fixed in 5.12.1).
- Node 20 is past end of life (April 2026). The plan pins it; Vite 8 and ESLint 10 need 20.19 or newer.
- pipecat 1.9.0 emits a DeprecationWarning when DeepgramTTSService is imported (AudioContextTTSService base class); warning only.
- Until the workspace trust dialog is accepted once in an interactive session here, Claude Code ignores permissions.allow from .claude/settings.json.
Env: Node 20 via nvm (`nvm use`). Docker via Colima. On this machine the root .env sets REDIS_HOST_PORT=6380 because Homebrew redis owns 6379 (see CLAUDE.local.md). Provider keys (voice-bot/.env) are first needed in M4.

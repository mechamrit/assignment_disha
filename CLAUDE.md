# Memory Card Voice Bot

Voice memory game: the host reads a word sequence, the player repeats it, the API scores it, and each cleared round adds a word.

**Core rule: sequence validation is deterministic API code (`api/src/domain`). The LLM only voices the host and never scores.** `HOST_MODE=scripted` must work with no LLM key.

## Commands

Run `nvm use` first. The Makefile refuses any Node major other than 20.

| Command | Does |
|---|---|
| `make install` | `npm ci` (api, web) and `uv sync --locked` (voice-bot) |
| `make infra-up` / `make infra-down` | Postgres 16 + Redis 7 via compose, waits for healthy / stops them (volumes kept) |
| `make db-migrate` | Apply Prisma migrations |
| `make api-dev` / `make bot-dev` / `make web-dev` | API :4000 / bot :7860 / web :5173 |
| `make contracts-emit` | Swagger to `contracts/openapi.json`, then web TS types and bot pydantic models |
| `make contracts-check` | Regenerate contracts, fail on `git diff` |
| `make lint` / `make test` / `make build` | ESLint + tsc + ruff / jest + vitest + pytest / api and web builds |
| `make ci` | Everything CI runs. Green before every commit |

A target whose inputs are not in the repo prints the missing file and the milestone that delivers it, then fails.

Per app:
- api: `npm run test -w api`; one file `npm run test -w api -- src/domain/__tests__/compare.spec.ts`; by name `npm run test -w api -- -t "name"`
- web: `npm run test -w web`
- voice-bot, from `voice-bot/`: `uv run pytest`; one test `uv run pytest tests/unit/test_intents.py -k repeat`

## Layout

- `api/`: NestJS 11 on Fastify, the system of record. `src/domain` (pure) ← `src/application` (use cases, ports) ← `src/infrastructure` (Prisma, Redis, HTTP). `src/modules` are the only composition roots.
- `voice-bot/`: Python 3.11, Pipecat, uv. Voice I/O plus the `GameGateProcessor` phase machine; calls the API internal endpoints every turn.
- `web/`: Vite + React 18 + Tailwind. Renders RTVI `game_state`; `GET /sessions/:id` polling wins on conflict.
- `contracts/`: OpenAPI and the RTVI JSON Schema, the source of every generated client.
- `docs/`: `PLAN.md` (spec), `STATE.md` (ledger), `adr/`.

Dependency rule: infrastructure → application → domain, never the reverse. Generated files (`contracts/openapi.json`, `web/src/shared/api/schema.d.ts`, `voice-bot/memory_bot/api/models.py`, `voice-bot/memory_bot/api/rtvi_models.py`) are never edited by hand.

## Invariants

1. No double score. Five layers, all required: Redis `SET mc:idem:{key} NX` → `Response.idempotencyKey` UNIQUE → Round status CAS → `GameSession.version` CAS → `Round.acceptedResponseId` UNIQUE. Losing Redis must never allow a second score.
2. Sequence words never enter the LLM context and never reach the browser: RTVI observer bot text events stay off, and `SessionView` hides the open round's sequence.
3. `GameGateProcessor.process_frame` never awaits network I/O. API calls run on the gate-owned job queue.
4. One `TTSSpeakFrame` per sequence, between `PresentationStartFrame` and `PresentationEndFrame` sentinels.
5. Postgres is truth. Redis is written after commit, and every read falls back to the DB.

## Workflow

- Spec: `docs/PLAN.md`. Follow it; do not redesign. One milestone per session (Milestones table, M0 to M9).
- Start with `/resume`. Before calling a milestone done, run `/verify-milestone M<n>` (runs `make ci` and the `plan-reviewer` subagent).
- Update `docs/STATE.md` before ending any session. Current state only, 60 lines max, never a changelog.
- One commit per milestone: `feat(m<n>): <summary>`, with `make ci` green first.
- `/clear` between milestones.
- When compacting, preserve: the list of modified files, failing tests with their error line, and the STATE.md next action.
- Docs describe current state only: no timeline or changelog wording, and no em dashes in docs or UI copy.
- Pin exact versions for anything added (`.npmrc` sets `save-exact`; Python uses `==`).

## Gotchas

- macOS: run the bot natively (`make bot-dev`). SmallWebRTC ICE fails in Docker without host networking; the compose `bot` service works on Linux only.
- Deepgram keyterm boosting caps at 500 tokens. Trim the vocabulary keyterms to about 50 words if it trips.
- `MinWordsUserTurnStartStrategy(min_words=2)` needs 2 words only while the bot speaks, 1 when silent. It is the only start strategy: a VAD start strategy fires first and makes it dead code.
- Pipecat is pinned to `pipecat-ai==1.9.0`. Use `PipelineWorker` and `WorkerRunner`; `PipelineTask` and `PipelineRunner` are deprecated aliases.
- Compose host ports come from the root `.env` (`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`). When one changes, change `DATABASE_URL` or `REDIS_URL` in `api/.env` to match.

@docs/STATE.md

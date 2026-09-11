# Memory Card Voice Bot

A voice memory game. The host reads a sequence of words, the player repeats it, the API scores the answer, and every cleared round adds a word.

Sequence validation is deterministic code in the API. The LLM only voices the host and never scores; a scripted host runs with no LLM key.

## Layout

| Path | What | Stack |
|---|---|---|
| `api/` | Game API, system of record | NestJS 11 on Fastify, TypeScript |
| `voice-bot/` | Voice I/O and turn-taking | Python 3.11, Pipecat 1.9.0, uv |
| `web/` | Player UI | Vite, React 18, TypeScript, Tailwind |
| `contracts/` | OpenAPI and RTVI schemas shared by the three apps | JSON |
| `docs/` | Spec, state ledger, ADRs | Markdown |

Ports: web 5173, api 4000, bot 7860, postgres 5432, redis 6379.

## Prerequisites

- Node 20 (`nvm use` reads `.nvmrc`)
- uv (it installs Python 3.11 when missing)
- Docker with Compose v2

## Commands

```bash
nvm use
make install
make infra-up
make ci
```

`make install` runs `npm ci` and `uv sync`. `make infra-up` starts Postgres 16 and Redis 7 and waits until both are healthy. `make ci` runs lint, tests, and builds. `make help` lists every target; a target whose parts are not in the repo names the missing file and fails.

If a local Postgres or Redis already uses 5432 or 6379, copy `.env.example` to `.env` and set `POSTGRES_HOST_PORT` or `REDIS_HOST_PORT`.

## Docs

- `docs/PLAN.md`: the approved spec (architecture, contracts, milestones).
- `docs/STATE.md`: what is built and verified, and the next action.
- `docs/adr/`: architecture decisions.

## Claude Code

Launch sessions from the repo root so `CLAUDE.md`, `.claude/rules`, skills, and hooks load. Start with `/resume`; check a milestone with `/verify-milestone M<n>`.

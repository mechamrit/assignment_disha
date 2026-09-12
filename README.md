# Memory Card Voice Bot

A voice memory game. The host reads a sequence of words, the player repeats it, the API scores the answer, and every cleared round adds a word.

Sequence validation is deterministic code in the API. The LLM only voices the host and never scores; a scripted host runs with no LLM key.

## Modules

| Path | What | Stack | Developer guide |
|---|---|---|---|
| `api/` | Game API, system of record | NestJS 11 on Fastify, TypeScript | [api/README.md](api/README.md) |
| `voice-bot/` | Voice I/O and turn-taking | Python 3.11, Pipecat 1.9.0, uv | [voice-bot/README.md](voice-bot/README.md) |
| `web/` | Player UI | Vite, React 18, TypeScript, Tailwind | [web/README.md](web/README.md) |
| `contracts/` | OpenAPI and RTVI schemas shared by the three apps | JSON | [contracts/README.md](contracts/README.md) |
| `docs/` | Spec, state ledger, architecture decisions | Markdown | [docs/adr/README.md](docs/adr/README.md) |
| `.claude/` | Claude Code rules, skills, hooks, reviewer agent | Markdown, shell | [.claude/README.md](.claude/README.md) |

How the processes talk:

- `web` calls the API's public endpoints and streams microphone audio to `voice-bot` over WebRTC.
- `voice-bot` calls the API's internal endpoints on every turn and pushes game state to `web` as RTVI messages.
- `api` keeps the truth in Postgres and uses Redis as a cache and as the idempotency fast path.

Ports: web 5173, api 4000, bot 7860, postgres 5432, redis 6379.

## Prerequisites

- Node 20.19 or a newer 20.x, through nvm. `make` and `npm ci` refuse any other version.
- uv 0.11.8 or newer (`voice-bot/pyproject.toml` enforces it; uv installs Python 3.11 when missing)
- Docker with Compose 2.24 or newer
- jq, used by the Claude Code format hook

## Getting started

```bash
nvm install
make install
make infra-up
make ci
```

`nvm install` reads `.nvmrc`, installs the newest Node 20 when it is missing, and switches to it; in a new shell `nvm use` is enough. `make install` runs `npm ci` and `uv sync --locked`. `make infra-up` starts Postgres 16 and Redis 7 and waits until both are healthy. `make ci` runs lint, tests, and builds, the same checks as `.github/workflows/ci.yml`. `make help` lists every target; targets for parts that are not built name the file they need and fail.

Run an app with `make api-dev` (http://localhost:4000) or `make web-dev` (http://localhost:5173).

## Local infrastructure

- Compose publishes every port on 127.0.0.1 only. Postgres uses development credentials (`mc`/`mc`) and Redis has no password, so neither is reachable from the network.
- Host ports come from the root `.env` (copy `.env.example`). If a local Postgres or Redis already uses 5432 or 6379, set `POSTGRES_HOST_PORT` or `REDIS_HOST_PORT`; anything connecting from the host then uses the new port.
- With Colima, publishing a container on a host port that another process holds raises no error: the container reports healthy while localhost keeps reaching the other process. Check the owner with `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
- The compose project is named `memory-card`, so every checkout of this repo drives the same containers and volumes. Keep the same root `.env` in each checkout.
- `make infra-down` removes the containers and keeps the data volumes.
- `docker compose --profile full up -d --build api web` also builds and runs the api and web images. The `bot` service needs Linux (see `voice-bot/README.md`).

## Docs

- `docs/PLAN.md`: the approved spec (architecture, contracts, milestones).
- `docs/STATE.md`: what is built and verified, and the next action.
- `docs/adr/`: architecture decisions.

## Claude Code

Launch sessions from the repo root so `CLAUDE.md`, rules, skills, and hooks load. Start with `/resume`; check a milestone with `/verify-milestone M<n>`. Details in [.claude/README.md](.claude/README.md).

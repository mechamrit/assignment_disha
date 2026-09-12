# contracts

Schemas shared by `api`, `web`, and `voice-bot`. The three processes talk only through these contracts and the clients generated from them.

Files in this tree: this README and `openapi.json`, emitted from the API.

Contents from `docs/PLAN.md`:

| File | Authored as | Generated from it |
|---|---|---|
| `openapi.json` | Emitted from the NestJS Swagger document by `api/scripts/emit-openapi.ts` | `web/src/shared/api/schema.d.ts` (openapi-typescript), `voice-bot/memory_bot/api/models.py` (datamodel-code-generator) |
| `rtvi/game-state.schema.json` | Hand-written JSON Schema for the RTVI `game_state` server message | web TypeScript type, `voice-bot/memory_bot/api/rtvi_models.py` |

Rules:

- `openapi.json` and every generated client are never edited by hand. Change the source (controllers and DTOs, or the RTVI schema), run `make contracts-emit`, and commit the source and the generated files together.
- `make contracts-check` regenerates and fails on any diff; CI runs it as its own job.
- `make contracts-emit` boots the API in memory, so it needs a generated Prisma client (`npm run db:generate -w api`) but no running database.

The RTVI schema and the generated web and bot clients arrive with the milestones that consume them (`docs/PLAN.md`).

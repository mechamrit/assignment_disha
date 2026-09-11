# contracts

Schemas shared by `api`, `web`, and `voice-bot`. The three processes talk only through these contracts and the clients generated from them.

| File | Authored as | Generated from it |
|---|---|---|
| `openapi.json` | Emitted from the NestJS Swagger document by `api/scripts/emit-openapi.ts` | `web/src/shared/api/schema.d.ts` (openapi-typescript), `voice-bot/memory_bot/api/models.py` (datamodel-code-generator) |
| `rtvi/game-state.schema.json` | Hand-written JSON Schema for the RTVI `game_state` server message | web TypeScript type, `voice-bot/memory_bot/api/rtvi_models.py` |

`openapi.json` and every generated client are never edited by hand. Change the source, run `make contracts-emit`, and commit source and generated files together. `make contracts-check` regenerates and fails on any diff.

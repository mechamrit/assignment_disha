---
paths:
  - "contracts/**"
  - "web/src/shared/api/schema.d.ts"
  - "voice-bot/memory_bot/api/models.py"
  - "voice-bot/memory_bot/api/*_models.py"
---

# contracts rules

- Generated, never edited by hand: `contracts/openapi.json`, `web/src/shared/api/schema.d.ts`, `voice-bot/memory_bot/api/models.py`, `voice-bot/memory_bot/api/rtvi_models.py`.
- Change the source instead. OpenAPI comes from NestJS controllers and DTOs; RTVI messages come from `contracts/rtvi/game-state.schema.json`, the one hand-written file here. Then run `make contracts-emit`.
- Commit the source change and every regenerated file together. `make contracts-check` (part of CI) fails on any drift.

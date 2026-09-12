Milestone: M4 done (M0 to M4 complete)        Done: M0 fe54682, M0 hardening bbeaff9, M2 a2eeafb, M1 eb6a12f, M3 740fc61, M4 in this session (`git log --oneline`)
Now: The API plays a whole game (sessions, rounds, idempotent scoring, leaderboard). The voice bot has its skeleton: typed settings, the Deepgram speech services with keyterm boosting, the turn-taking rules, an echo host, the pipeline builder, the API client for the internal endpoints, and `bot.py` for the SmallWebRTC runner. web is still the M0 shell.
Next action: M5. The game loop in scripted mode: memory_bot/frames.py (presentation sentinels), memory_bot/game/{state,intents,gate,presenter,tracker}.py, and memory_bot/host/{phrases,scripted}.py, with pytest covering every row of the phase table against a fake API. Generate the bot's pydantic models as part of it: the public contracts/openapi.json hides the internal routes on purpose, so emit a second complete document (contracts/openapi-internal.json) from the same Nest app and generate from that, keeping /docs public.
Blocked: two things, neither blocking M5.
  1. A spoken round needs DEEPGRAM_API_KEY in voice-bot/.env. Without it the runner starts and serves its client, but a caller gets MissingDeepgramKeyError.
  2. The browser voice client: @pipecat-ai/small-webrtc-transport pulls @daily-co/daily-js, which needs Node 22.14 from 0.89.0 on, so on Node 20 only the older set installs (client-js 1.6.x with transport 1.9.0) and its RTVI protocol may not match Python pipecat 1.9.0. Decide before M8: move the repo to Node 22, pin the older client set, or drop engine-strict.
Last verified:
- make ci: exit 0 (api 83 unit tests, web vitest, bot 39 pytest, api and web builds, lint and formatting across all three)
- `uv run bot.py -t webrtc` starts in 4 s, serves the Pipecat prebuilt client at /client/ (200), and /api/offer rejects an empty body with 422 naming the missing sdp and type fields; the port is released on shutdown
- bot pytest proves the Pipecat surface the plan relies on: the pipeline assembles with stub services (no keys), the aggregator pair exposes user() and assistant(), PipelineWorker accepts the metrics params and exposes .rtvi, MinWords is the only start strategy, and Smart Turn is the stop strategy
- the API client sends `idempotency-key: <roundId>:<attemptSeq>` and turns 409 IN_FLIGHT, SESSION_ENDED, and STALE_BOT into distinct exception types
- settings fall back from llm to scripted when the selected provider key is empty
- api e2e (3 suites, 23 tests) and the M3 concurrency proofs still pass unchanged
Notes:
- The echo host is scaffolding, not the game host: it repeats the player's last sentence so the pipeline can be exercised without an LLM key. M5 and M6 replace it.
- The Smart Turn analyzer is constructed through an injectable factory, so tests never download its model.
- Deepgram keyterms are capped at 100 words in the service factory; the API sends about 85.
- The API refuses to score an answer with no vocabulary words (VALIDATION) and records a CHATTER event instead, so a stray "hmm" can never end a game.
- A fresh clone needs `npm run db:generate -w api` before typecheck, tests, or build.
- Prisma is pinned to 6.19.3 and nestjs-pino to 4.6.1 with pino 9, because their newest releases require Node 22.
- Root package.json overrides fastify to 5.12.4 (GHSA-w2qp-rph6-63g4, GHSA-3m5p-2c4r-xxw2, fixed in 5.12.1).
- The allow list in .claude/settings.json is narrower than the sketch in docs/PLAN.md: `curl -s http://localhost*` and `uv run *` both match commands that reach other hosts or run any program.
Env: Node 20 via nvm (`nvm use`). Docker via Colima. On this machine the root .env sets REDIS_HOST_PORT=6380 because Homebrew redis owns 6379, and api/.env points DATABASE_URL and REDIS_URL at 127.0.0.1:5432 and 127.0.0.1:6380 (see CLAUDE.local.md). voice-bot/.env does not exist yet; create it from .env.example and add DEEPGRAM_API_KEY for a spoken round.

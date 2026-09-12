Milestone: M5 done (M0 to M5 complete)        Done: M0 fe54682, M0 hardening bbeaff9, M2 a2eeafb, M1 eb6a12f, M3 740fc61, M4 a3e2a03, M5 in this session (`git log --oneline`). Pushed to git@github.com:mechamrit/assignment_disha.git (main).
Now: A whole game exists in code. The API owns sessions, rounds, idempotent scoring, and the leaderboard. The bot has the scripted game loop: presentation sentinels, the gate phase machine, the presenter and tracker, the intent matcher, the phrase bank and scripted host, the API client, and the pipeline and runner wiring (ready handshake, end_game message, disconnect). web is still the M0 shell.
Next action: M6. The LLM host: memory_bot/host/{prompt,llm_factory,tools}.py, the GAME_EVENT message the host reacts to, and the provider switch for gemini, groq, and openai with the scripted fallback already in place. Then generate memory_bot/api/models.py: the committed contracts/openapi.json hides the internal routes on purpose, so emit a second complete document (contracts/openapi-internal.json) from the same Nest app and generate from that, keeping /docs public.
Blocked: two things, neither blocking M6.
  1. A spoken round needs DEEPGRAM_API_KEY in voice-bot/.env. Everything below the microphone is covered by tests, but no real audio has passed through yet.
  2. The browser voice client: @pipecat-ai/small-webrtc-transport pulls @daily-co/daily-js, which needs Node 22.14 from 0.89.0 on, so on Node 20 only the older set installs (client-js 1.6.x with transport 1.9.0) and its RTVI protocol may not match Python pipecat 1.9.0. Decide before M8: move the repo to Node 22, pin the older client set, or drop engine-strict.
Last verified:
- make ci: exit 0 (api 83 unit tests, web vitest, bot 93 pytest, api and web builds, lint and formatting across all three)
- the gate phase table, against a fake API (11 tests): the intro leads into the first read-out; finishing the read-out tells the API the round was presented and opens the answer window; an answer is sent once with attempt 1 and the score comes from the verdict; an IN_FLIGHT retry reuses the same attempt number; asking to repeat reopens the read-out without answering; chatter is recorded and never scored; talking while a verdict is pending cannot change it; giving up sends one GIVE_UP; a lost game says goodbye and queues the end; quitting ends the session at the API; and no game_state message ever contains a round's words
- presentation: the sequence is queued as one TTSSpeakFrame between sentinels with append_to_context false, and the tracker reports started, finished, and interrupted in the right order
- `uv run bot.py -t webrtc` boots in 4 s with the game wiring and serves the client page (200)
- api e2e (3 suites, 23 tests) and the M3 concurrency proofs still pass unchanged
Notes:
- The gate never awaits the network inside process_frame: it snapshots the turn, flips the phase, and queues a job for a task created on StartFrame, because Pipecat cancels the frame task on an interruption.
- One TTSSpeakFrame per sequence, never one per word: per-word frames would let the bot stop speaking between words, which drops the interruption threshold to a single word.
- The idempotency key is derived from roundId and attemptSeq on both sides; the API rejects a mismatched header rather than trusting it.
- The API refuses to score an answer with no vocabulary words (VALIDATION) and records a CHATTER event instead.
- A fresh clone needs `npm run db:generate -w api` before typecheck, tests, or build.
- Prisma is pinned to 6.19.3 and nestjs-pino to 4.6.1 with pino 9, because their newest releases require Node 22.
- Root package.json overrides fastify to 5.12.4 (GHSA-w2qp-rph6-63g4, GHSA-3m5p-2c4r-xxw2, fixed in 5.12.1).
- The allow list in .claude/settings.json is narrower than the sketch in docs/PLAN.md: `curl -s http://localhost*` and `uv run *` both match commands that reach other hosts or run any program.
Env: Node 20 via nvm (`nvm use`). Docker via Colima. On this machine the root .env sets REDIS_HOST_PORT=6380 because Homebrew redis owns 6379, and api/.env points DATABASE_URL and REDIS_URL at 127.0.0.1:5432 and 127.0.0.1:6380 (see CLAUDE.local.md). voice-bot/.env does not exist yet; create it from .env.example and add DEEPGRAM_API_KEY for a spoken round.

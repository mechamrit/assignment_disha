Milestone: M6 done (M0 to M6 complete)        Done: M0 fe54682, M0 hardening bbeaff9, M2 a2eeafb, M1 eb6a12f, M3 740fc61, M4 a3e2a03, M5 57418ef, M6 in this session (`git log --oneline`). Pushed to git@github.com:mechamrit/assignment_disha.git (main).
Now: The host can be a model. memory_bot/host/{prompt,llm_factory,tools,voice}.py add the Max persona, the provider switch for gemini, groq, and openai, three tools, and the split between a scripted voice and a model voice. The gate reports a game event and the voice renders it, so the model never decides an outcome and never sees an open round's words. Without a provider key the scripted phrase bank still runs the whole game. web is still the M0 shell.
Next action: M7. Interruption and robustness: interrupting the read-out and the reaction, the presentation watchdog, the answer-window timeout, the idle nudge and idle end, and the disconnect path, each with a test that drives the gate through it.
Blocked: two things, neither blocking M7.
  1. A spoken round needs DEEPGRAM_API_KEY in voice-bot/.env. Everything below the microphone is covered by tests, but no real audio has passed through yet.
  2. The browser voice client: @pipecat-ai/small-webrtc-transport pulls @daily-co/daily-js, which needs Node 22.14 from 0.89.0 on, so on Node 20 only the older set installs (client-js 1.6.x with transport 1.9.0) and its RTVI protocol may not match Python pipecat 1.9.0. Decide before M8: move the repo to Node 22, pin the older client set, or drop engine-strict.
Last verified:
- make ci: exit 0 (api 83 unit tests, web vitest, bot 118 pytest, api and web builds, lint and formatting across all three)
- the host tools: each records an intent on the gate and returns run_llm false, so a tool call takes the same path a spoken command does and the model is not asked to speak twice; a tool called with no game running reports it rather than raising
- the host voice: a scripted host renders an event from the phrase bank, a model host receives it as exactly one context message and runs once
- the provider switch: gemini, groq, and openai each build their service, an unknown provider raises UnknownProviderError, and an empty provider key falls back to the scripted host
- the gate phase table, against a fake API (11 tests): the intro leads into the first read-out; finishing the read-out tells the API the round was presented and opens the answer window; an answer is sent once with attempt 1 and the score comes from the verdict; an IN_FLIGHT retry reuses the same attempt number; asking to repeat reopens the read-out without answering; chatter is recorded and never scored; talking while a verdict is pending cannot change it; giving up sends one GIVE_UP; a lost game says goodbye and queues the end; quitting ends the session at the API; and no game_state message ever contains a round's words
- presentation: the sequence is queued as one TTSSpeakFrame between sentinels with append_to_context false, and the tracker reports started, finished, and interrupted in the right order
- api e2e (3 suites, 23 tests) and the M3 concurrency proofs still pass unchanged
Notes:
- Tools are offered to the model only when the host is a model; the scripted host gets a context with no tools, so it cannot be asked to call one.
- The RTVI observer forwards no bot text, TTS text, or LLM output to the browser, which is what keeps a round's words on the audio path only.
- The gate never awaits the network inside process_frame: it snapshots the turn, flips the phase, and queues a job for a task created on StartFrame, because Pipecat cancels the frame task on an interruption.
- One TTSSpeakFrame per sequence, never one per word: per-word frames would let the bot stop speaking between words, which drops the interruption threshold to a single word.
- The idempotency key is derived from roundId and attemptSeq on both sides; the API rejects a mismatched header rather than trusting it.
- The API refuses to score an answer with no vocabulary words (VALIDATION) and records a CHATTER event instead.
- A fresh clone needs `npm run db:generate -w api` before typecheck, tests, or build.
- Prisma is pinned to 6.19.3 and nestjs-pino to 4.6.1 with pino 9, because their newest releases require Node 22.
- Root package.json overrides fastify to 5.12.4 (GHSA-w2qp-rph6-63g4, GHSA-3m5p-2c4r-xxw2, fixed in 5.12.1).
- The allow list in .claude/settings.json is narrower than the sketch in docs/PLAN.md: `curl -s http://localhost*` and `uv run *` both match commands that reach other hosts or run any program.
- memory_bot/api/models.py is still to generate: the committed contracts/openapi.json hides the internal routes on purpose, so a second complete document (contracts/openapi-internal.json) has to be emitted from the same Nest app and generated from, keeping /docs public.
Env: Node 20 via nvm (`nvm use`). Docker via Colima. On this machine the root .env sets REDIS_HOST_PORT=6380 because Homebrew redis owns 6379, and api/.env points DATABASE_URL and REDIS_URL at 127.0.0.1:5432 and 127.0.0.1:6380 (see CLAUDE.local.md). voice-bot/.env does not exist yet; create it from .env.example and add DEEPGRAM_API_KEY for a spoken round.

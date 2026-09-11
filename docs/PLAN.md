# Memory Card Voice Bot (Pipecat + NestJS) — Implementation Plan

## Context

Backend engineering assignment: a voice memory game. Bot speaks a word sequence, player repeats it, bot scores it, difficulty rises per cleared round. Must show proper turn-taking, graceful interruption recovery (on video), an engaging host, persisted sessions/rounds/responses/scores, REST APIs, meaningful caching, no double-scoring, and a minimal web UI.

Greenfield. Lives at `/Users/amritpalsingh/chats_only/memory-card-voice-bot/`, a sibling of the iQBG workspace, own git repo (see "Claude Code development layout" for why not inside the workspace). Pipecat is Python-only, so the system is three apps: a NestJS API that owns all game truth, a thin Python Pipecat bot for voice I/O, and a small React UI.

Core rule from the user: **sequence validation is deterministic NestJS code. It never depends on an LLM prompt.** The LLM is only the host persona, and a scripted phrase-bank host must work with no LLM key at all.

## Locked decisions

| Area | Choice |
|---|---|
| Location / layout | `/Users/amritpalsingh/chats_only/memory-card-voice-bot/` (outside the iQBG workspace), flat polyglot monorepo: `api/` (NestJS 11, Fastify adapter, TS), `voice-bot/` (Python 3.11, `pipecat-ai==1.9.0`), `web/` (Vite + React 18 + TS + Tailwind), `contracts/` (OpenAPI + RTVI JSON Schema, generated clients), `docs/adr/`, root `docker-compose.yml`, `.github/workflows/ci.yml` |
| Transport | Pipecat SmallWebRTC via the dev runner (`python bot.py -t webrtc`). Code stays Daily-compatible through `create_transport`. |
| STT / TTS | Deepgram Nova-3 (`nova-3-general`, keyterm boosting with the vocabulary) / Deepgram Aura-2 (`aura-2-thalia-en`). One `DEEPGRAM_API_KEY`. |
| LLM (host only) | `LLM_PROVIDER=gemini\|groq\|openai`, default Gemini flash. `HOST_MODE=llm\|scripted`, auto-falls back to `scripted` when the provider key is empty. |
| DB / cache | PostgreSQL 16 + Prisma. Redis 7 (ioredis). Postgres is truth; Redis is write-through after commit, every read falls back to DB. |
| Package tooling | npm workspaces (matches user's other repos, zero extra tooling for reviewers). Python via `uv` + `pyproject.toml`, with `pip install -e .` fallback documented. Node 20. |

Assumptions (override if wrong): `MAX_STRIKES=1` (classic: first miss ends the game), `MAX_ROUNDS=15`, host persona named "Max", English-only vocabulary, no user auth beyond nickname + per-session opaque token.

## Architecture

**Ownership**
- **API (NestJS)** = system of record + pure domain (engine + session/round state machines) + use cases behind ports + Prisma/Redis adapters + idempotency + leaderboard.
- **Bot (Python)** = voice I/O + a phase machine (`GameGateProcessor`) that calls the API's internal endpoints every turn. Presents sequences with code-driven TTS. Never scores.
- **Web (React)** = `POST /sessions` → connect mic to bot with `{sessionId, clientToken}` → render RTVI `server-message` game state instantly, reconcile with `GET /sessions/:id` polling (truth).

**Ports**: web 5173, api 4000, bot 7860, postgres 5432, redis 6379.

**Bot pipeline (Pipecat 1.9.0, verified names)**

```
PipelineWorker(enable_rtvi=True)   # prepends RTVIProcessor itself; reach it via worker.rtvi. Do NOT add RTVIProcessor to the list.
Pipeline([
  transport.input(),
  stt,                    # DeepgramSTTService(settings=Settings(model="nova-3-general", keyterm=[vocab...], punctuate=True, smart_format=False, numerals=False))
  user_aggregator,        # LLMContextAggregatorPair user side: MinWords(2) start, SmartTurn v3 stop, Silero VAD stop_secs=0.2, user_turn_stop_timeout=2.0, user_idle_timeout=8
  game_gate,              # GameGateProcessor: intercepts LLMContextFrame, owns phases, presents sequences
  host,                   # GoogleLLMService | GroqLLMService | OpenAILLMService  OR  ScriptedHostProcessor
  tts,                    # DeepgramTTSService(settings=Settings(voice="aura-2-thalia-en"))
  transport.output(),
  presentation_tracker,   # consumes PresentationStart/EndFrame sentinels after audio has played -> gate callbacks
  assistant_aggregator,
])
runner = WorkerRunner(handle_sigint=..., handle_sigterm=...); await runner.add_workers(worker); await runner.run()
```

Key verified facts driving the design (from Pipecat 1.9.0 source/docs):
- `PipelineTask`/`PipelineRunner` are deprecated aliases; use `pipecat.pipeline.worker.PipelineWorker` and `pipecat.workers.runner.WorkerRunner`.
- User aggregator pushes `LLMContextFrame(context, speculation=False)` downstream on turn stop; events `on_user_turn_stopped`, `on_user_turn_idle`. Assistant aggregator fires `on_assistant_turn_stopped(aggregator, message)` with `message.interrupted` after partial text is committed.
- `MinWordsUserTurnStartStrategy(min_words=2)` needs 2 words only while the bot speaks, 1 word when silent. Using it **alone** (no VAD start strategy, which would fire first and make it dead code). VAD analyzer still set because stop strategies and Smart Turn need it.
- `TTSService` forwards unknown non-system frames through its serialization queue in order with audio contexts; `BaseOutputTransport` pushes non-audio frames only after preceding audio has been written. `InterruptionFrame` resets both queues. So sentinel ControlFrames around the presentation give a reliable "finished" signal, and their absence plus an `InterruptionFrame` means "cut off".
- One `TTSSpeakFrame` per sequence (not per word): per-word frames would fire `BotStoppedSpeakingFrame` between words, flip MinWords to the 1-word threshold in the gaps, and let a "hmm" interrupt the read-out.
- `FrameProcessor` cancels its process task on `InterruptionFrame`, so the gate must never await network I/O inside `process_frame`.
- Client: `client.connect({ webrtcRequestParams: { endpoint, requestData: { sessionId, clientToken } } })` → runner `POST /api/offer` → `runner_args.body`.

## Repository structure

**Principles behind the layout** (each one is enforced, not aspirational):
1. **One top-level folder per deployable, flat.** Three processes, two languages. No `apps/` umbrella that pretends a Python service is part of an npm workspace. Mirrors how the user already organises iQBG (`iqbg-backend`, `iqbg-frontend`, `iqbg-workers`).
2. **Contract-first between processes.** The API's Swagger doc is emitted to `contracts/openapi.json` and committed. Web generates TS types from it (`openapi-typescript`); the bot generates pydantic models from it (`datamodel-code-generator`). The RTVI `game_state` payload is a JSON Schema in `contracts/rtvi/`. CI regenerates and fails on diff, so the three processes cannot drift silently.
3. **Ports and adapters inside the API, pure domain in the middle.** `domain/` has zero imports from Nest, Prisma, or Redis (enforced by an ESLint `no-restricted-imports` rule). Application services depend on repository/cache **ports** (TS interfaces); Prisma and Redis are adapters bound in the Nest module. Tests of the answer transaction run against in-memory ports; e2e runs against real Postgres + Redis.
4. **Bot split by responsibility, not by file type.** `pipeline/` (assembly, turn strategies, service factories), `game/` (phase machine, presenter, tracker, intents), `host/` (prompt, phrase bank, scripted host, tools), `api/` (generated models + client). Pipecat-specific reliance lives only in `pipeline/` and `game/tracker.py`.
5. **Decisions recorded as ADRs**, compose at repo root (`docker compose up` just works), CI from day one.

```
memory-card-voice-bot/
├── README.md  Makefile  docker-compose.yml  .env.example  .nvmrc  .python-version  .gitignore  .editorconfig
├── package.json                         # npm workspaces: api, web (tooling only; bot is uv)
├── .github/workflows/ci.yml             # lint, unit, e2e (services: postgres, redis), contracts:check, bot pytest, web vitest
├── contracts/
│   ├── openapi.json                     # emitted from NestJS Swagger (npm run openapi:emit), committed
│   └── rtvi/game-state.schema.json      # server-message payload; TS type + pydantic model generated from it
├── docs/
│   ├── ARCHITECTURE.md  RUNBOOK.md  DEMO-SCRIPT.md
│   └── adr/0001-api-owns-game-truth.md  0002-deterministic-validation-no-llm.md  0003-min-words-interruption-policy.md
│           0004-postgres-prisma-over-mongo.md  0005-idempotency-layers.md  0006-smallwebrtc-transport.md
├── api/                                 # NestJS 11 + Fastify
│   ├── package.json  nest-cli.json  tsconfig*.json  jest.config.ts  .eslintrc.cjs  .env.example  Dockerfile
│   ├── prisma/{schema.prisma, migrations/, seed.ts}
│   ├── scripts/emit-openapi.ts          # boots app in-process, writes ../contracts/openapi.json
│   ├── src/main.ts  src/app.module.ts
│   ├── src/config/env.ts                # zod-validated env, typed ConfigService
│   ├── src/domain/                      # PURE: no Nest, no I/O (lint-enforced)
│   │   ├── vocabulary.ts  ladder.ts  sequence.ts  normalize.ts  compare.ts  score.ts  evaluate.ts
│   │   ├── session.state.ts             # SessionStatus/EndReason transitions + guards
│   │   ├── round.state.ts               # RoundStatus transitions
│   │   ├── errors.ts                    # DomainError subclasses with codes
│   │   └── __tests__/                   # unit + property tests
│   ├── src/application/                 # use cases; depend on ports only
│   │   ├── ports/{session.repository.ts, round.repository.ts, cache.port.ts, idempotency.port.ts, clock.port.ts, id.port.ts}
│   │   ├── sessions/{create-session.ts, attach-bot.ts, get-session.ts, end-session.ts, expire-stale-sessions.ts}
│   │   ├── rounds/{next-round.ts, mark-presented.ts, submit-answer.ts, repeat-round.ts, record-event.ts}
│   │   ├── leaderboard/{get-leaderboard.ts, get-recent-scores.ts, on-session-completed.ts}
│   │   └── __tests__/                   # use cases against in-memory ports (incl. concurrent submit-answer)
│   ├── src/infrastructure/              # adapters
│   │   ├── prisma/{prisma.service.ts, prisma-session.repository.ts, prisma-round.repository.ts, unit-of-work.ts}
│   │   ├── redis/{redis.service.ts, redis-cache.adapter.ts, redis-idempotency.adapter.ts, keys.ts}
│   │   ├── http/{public/{sessions.controller.ts, rounds.controller.ts, scores.controller.ts, health.controller.ts},
│   │   │        internal/{sessions-internal.controller.ts, rounds-internal.controller.ts},
│   │   │        dto/*, guards/internal-token.guard.ts, filters/domain-error.filter.ts, decorators/*}
│   │   ├── scheduling/sweeper.ts        # @nestjs/schedule → expire-stale-sessions
│   │   └── logging/pino.ts
│   ├── src/modules/{sessions.module.ts, rounds.module.ts, leaderboard.module.ts, infra.module.ts, health.module.ts}   # composition roots binding ports→adapters
│   └── test/{setup.ts, sessions.e2e-spec.ts, answer-idempotency.e2e-spec.ts, answer-race.e2e-spec.ts, leaderboard.e2e-spec.ts, sweeper.e2e-spec.ts}
├── voice-bot/                           # Python 3.11, Pipecat 1.9.0
│   ├── pyproject.toml  uv.lock  .env.example  Dockerfile  README.md
│   ├── bot.py                           # runner entry: bot(runner_args) → build_pipeline → WorkerRunner
│   ├── memory_bot/
│   │   ├── config.py                    # pydantic-settings
│   │   ├── frames.py                    # PresentationStartFrame, PresentationEndFrame, GameControlFrame
│   │   ├── pipeline/{builder.py, turns.py, services.py}      # assembly; the ONLY place Pipecat service/strategy classes are imported
│   │   ├── game/{state.py, gate.py, presenter.py, tracker.py, intents.py}
│   │   ├── host/{prompt.py, phrases.py, scripted.py, tools.py, llm_factory.py}
│   │   └── api/{client.py, models.py (generated from contracts/openapi.json), rtvi_models.py (generated), errors.py}
│   └── tests/{conftest.py, fakes.py, unit/{test_intents.py, test_phrases.py, test_state.py}, integration/{test_gate_phases.py, test_tracker_ordering.py, test_api_client.py}, live/test_tts_sentinels.py}
└── web/                                 # Vite + React 18 + TS + Tailwind
    ├── package.json  vite.config.ts  tsconfig.json  index.html  tailwind.config.ts  .env.example  Dockerfile  nginx.conf
    └── src/
        ├── main.tsx  App.tsx  styles.css
        ├── shared/{api/{schema.d.ts (generated), client.ts}, pipecat/{client.ts, events.ts}, ui/{StatusPill, ErrorBanner, MicMeter}.tsx, format.ts}
        └── features/
            ├── session/{StartCard.tsx, useGameSession.ts, gameReducer.ts, EndButton.tsx}
            ├── game/{GamePanel.tsx, TranscriptFeed.tsx, VerdictBanner.tsx, FinalResultCard.tsx, useBotEvents.ts, usePolling.ts}
            └── leaderboard/{Leaderboard.tsx, RecentScores.tsx}
```

Dependency rule (API): `infrastructure → application → domain`; never the reverse. `modules/*` are the only files that import from all three. Generated files (`contracts/openapi.json`, `web/src/shared/api/schema.d.ts`, `voice-bot/memory_bot/api/models.py`) are committed and checked by `make contracts-check`.

## Data model (`api/prisma/schema.prisma`)

```prisma
enum SessionStatus { CREATED IN_PROGRESS COMPLETED ABANDONED EXPIRED }
enum EndReason     { FAILED MAX_ROUNDS QUIT DISCONNECTED IDLE_TIMEOUT EXPIRED CLIENT_END }
enum RoundStatus   { CREATED AWAITING_ANSWER EVALUATED }
enum RoundOutcome  { PASS FAIL TIMEOUT }
enum ResponseKind  { ANSWER TIMEOUT GIVE_UP COMMAND CHATTER INTERRUPTION }
enum Difficulty    { EASY HARD }

model Player      { id String @id @default(uuid()); name String; nameKey String @unique; createdAt DateTime @default(now()); sessions GameSession[] }

model GameSession {
  id String @id @default(uuid()); playerId String; player Player @relation(fields:[playerId], references:[id])
  status SessionStatus @default(CREATED); score Int @default(0); roundsCleared Int @default(0)
  strikes Int @default(0); maxStrikes Int; maxRounds Int; currentRoundNumber Int @default(0)
  version Int @default(0)                 // optimistic CAS
  clientTokenHash String; botInstanceId String?
  endReason EndReason?; startedAt DateTime?; endedAt DateTime?; lastActivityAt DateTime @default(now())
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  rounds Round[]; events SessionEvent[]
  @@index([status, lastActivityAt]) @@index([playerId, createdAt]) @@index([status, score])
}

model Round {
  id String @id @default(uuid()); sessionId String; session GameSession @relation(fields:[sessionId], references:[id], onDelete: Cascade)
  number Int; sequence String[]; difficulty Difficulty; separator String @default(". ")
  status RoundStatus @default(CREATED); outcome RoundOutcome?; repeats Int @default(0); pointsAwarded Int @default(0)
  presentedAt DateTime?; answeredAt DateTime?; latencyMs Int?
  acceptedResponseId String? @unique      // exactly one accepted response per round
  acceptedResponse Response? @relation("AcceptedResponse", fields:[acceptedResponseId], references:[id])
  responses Response[] @relation("RoundResponses")
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@unique([sessionId, number])
}

model Response {
  id String @id @default(uuid()); roundId String; round Round @relation("RoundResponses", fields:[roundId], references:[id], onDelete: Cascade)
  attemptSeq Int; kind ResponseKind; transcriptRaw String; normalizedTokens String[]; vocabTokens String[]; isCorrect Boolean?
  idempotencyKey String @unique; latencyMs Int?; botInstanceId String?; createdAt DateTime @default(now())
  acceptedForRound Round? @relation("AcceptedResponse")
  @@unique([roundId, attemptSeq])
}

model SessionEvent { id String @id @default(uuid()); sessionId String; session GameSession @relation(...); type String; payload Json; createdAt DateTime @default(now()); @@index([sessionId, createdAt]) }
```

Vocabulary is a hardcoded TS constant (`vocabulary.ts`): two buckets (EASY / HARD), ≥40 words each, phonetically distinct, no numbers, no homophones, no confusable pairs. Served to the bot in the attach response (single source of truth, also used as Deepgram keyterms).

## API contract

Errors: `{ statusCode, code, message, details? }`. Codes: `SESSION_NOT_FOUND`, `SESSION_ENDED`, `INVALID_CLIENT_TOKEN`, `STALE_BOT`, `ROUND_NOT_OPEN`, `IN_FLIGHT`, `VALIDATION`. Swagger at `/docs`.

**Public** (CORS `WEB_ORIGIN`; `POST /sessions` throttled 20/min/IP)

| Endpoint | Request | Response |
|---|---|---|
| `POST /sessions` | `{ playerName: 2..24 chars }` | `201 { sessionId, clientToken, player:{id,name}, status:"CREATED", bot:{ offerUrl }, config:{ maxStrikes, maxRounds } }` |
| `GET /sessions/:id` | | `200 SessionView { id, player:{name}, status, score, roundsCleared, strikes, maxStrikes, currentRound:{number,length,status,repeats}\|null, lastRound:{number,sequence,heard,outcome,pointsAwarded}\|null, endReason, startedAt, endedAt, updatedAt }` (open-round sequence hidden) |
| `GET /sessions/:id/rounds` | | `200 { rounds:[{ number, length, status, outcome, repeats, pointsAwarded, sequence? (EVALUATED only), heard? }] }` |
| `POST /sessions/:id/end` | header `X-Client-Token` | `200 SessionView` (idempotent) |
| `GET /scores/recent?limit=20` | | `200 { scores:[{ sessionId, playerName, score, roundsCleared, endedAt, endReason }] }` |
| `GET /leaderboard?limit=10` | | `200 { entries:[{ rank, playerId, playerName, bestScore, bestRounds, achievedAt }] }` |
| `GET /health` | | `200 { status, db, redis:"ok"\|"degraded", uptimeSec }`, 503 if DB down |

**Internal** (guard `X-Internal-Token`, timing-safe compare; no CORS). `RoundForBot = { id, number, sequence[], separator, status, repeats }`.

| Endpoint | Request | Response |
|---|---|---|
| `POST /internal/sessions/:id/attach` | `{ clientToken, botInstanceId }` | `200 { session, vocabulary:{ keyterms[], fillers[] }, config:{ maxStrikes, maxRounds, ladder[], answerIdleSecs }, currentRound: RoundForBot }`; CREATED→IN_PROGRESS; re-attach with same token replaces `botInstanceId`; 401 / 404 / 409 SESSION_ENDED |
| `POST /internal/sessions/:id/rounds/next` | `{ botInstanceId }` | `200 { round, created }` (returns open round if one exists) |
| `POST .../rounds/:roundId/presented` | `{ botInstanceId }` | `200 { round }` CREATED→AWAITING_ANSWER, idempotent |
| `POST .../rounds/:roundId/answer` | header `Idempotency-Key: <roundId>:<attemptSeq>`; `{ botInstanceId, attemptSeq, kind: ANSWER\|TIMEOUT\|GIVE_UP, transcript, latencyMs?, answeredDuringPresentation? }` | `200 Verdict { replayed, roundId, roundNumber, correct, outcome, expected[], heardRaw, heardTokens[], detail:{ firstErrorIndex, missing[], extra[] }, points:{ base, speedBonus, streakBonus, repeatMultiplier, total }, session:{ score, roundsCleared, strikes, maxStrikes, status, endReason }, gameOver, nextRound: RoundForBot\|null }`; 409 IN_FLIGHT (retry 200 ms), 409 ROUND_NOT_OPEN (never for a valid replay), 409 STALE_BOT |
| `POST .../rounds/:roundId/repeat` | `{ botInstanceId, reason: REQUESTED\|INTERRUPTED }` | `200 { round }` repeats+1, status→CREATED |
| `POST /internal/sessions/:id/events` | `{ botInstanceId, type, payload }` | `202` (COMMAND / CHATTER / INTERRUPTION / NUDGE / BOT_ERROR) |
| `POST /internal/sessions/:id/end` | `{ botInstanceId?, reason: EndReason }` | `200 SessionView` idempotent, first writer wins |

**`submit-answer` use case (`api/src/application/rounds/submit-answer.ts`, executed through the `UnitOfWork` port) — the no-double-score core**
1. `idempotency.begin(key)` (port; Redis adapter): `SET mc:idem:{key} "__inflight__" NX EX 60`. Existing verdict JSON → return it with `replayed:true`. `__inflight__` → 409 IN_FLIGHT.
2. `unitOfWork.run(async tx => …)` (Prisma adapter: `$transaction` with `isolationLevel: 'Serializable'`), retried once on serialization / CAS failure:
   - load round + session; assert `IN_PROGRESS` and `session.botInstanceId === body.botInstanceId`;
   - if `round.status === EVALUATED` → return stored verdict (`replayed:true`);
   - `verdict = evaluateAnswer(...)` (pure);
   - `tx.response.create(...)` (unique violation on `idempotencyKey` → replay path);
   - `tx.round.updateMany({ where:{ id, status:{ in:['CREATED','AWAITING_ANSWER'] } }, data:{ status:'EVALUATED', outcome, pointsAwarded, answeredAt, latencyMs, acceptedResponseId, presentedAt: presentedAt ?? now } })` → count 0 → throw `RoundCas`;
   - session math (`score`, `roundsCleared`, `strikes`, `gameOver = strikes >= maxStrikes || roundsCleared >= maxRounds`) via `tx.gameSession.updateMany({ where:{ id, version }, data:{ ..., version:{ increment:1 }, status, endReason, endedAt, lastActivityAt } })` → count 0 → throw `SessionCas`;
   - if not gameOver → create next `Round` from `ladderFor(n+1)` + `generateSequence(step, recentWords)`;
   - `tx.sessionEvent.create({ type:'ROUND_EVALUATED' })`.
3. Post-commit: `cache.writeSession`, `on-session-completed` use case if gameOver, push words to `recent_words`, `idempotency.complete(key, verdict, 3600)`.
4. On error: `idempotency.release(key)` so the bot's retry (same key) proceeds.

Layers: Redis NX fast path → `Response.idempotencyKey` UNIQUE → Round status CAS → `GameSession.version` CAS → `Round.acceptedResponseId` UNIQUE. Redis loss never allows a double score.

**Cache keys** (`api/src/infrastructure/redis/keys.ts`, prefix `mc:`): `session:{id}` JSON TTL 1800 sliding (read by `GET /sessions/:id` and every internal call); `idem:{key}`; `leaderboard:best` ZSET + `leaderboard:meta` HASH + `leaderboard:ready` flag (rebuilt from DB on miss); `scores:recent` LIST LTRIM 0 49; `player:{id}:recent_words` LIST LTRIM 0 59 TTL 24h (sequence generator excludes them); `vocab:keyterms`.

**Sweeper**: every 60 s, `CREATED`/`IN_PROGRESS` with `lastActivityAt < now - STALE_SESSION_MINUTES` → `EXPIRED` via `updateMany` with status guard.

## Domain (pure, `api/src/domain`; no Nest/Prisma/Redis imports, lint-enforced)

```ts
export const VOCABULARY: Readonly<Record<'EASY'|'HARD', readonly string[]>>;
export const FILLERS: ReadonlySet<string>;   // um uh hmm erm like okay ok so and then the a yeah yes
export function ladderFor(round: number, cfg?): LadderStep;            // length = min(2 + round, 12); bucket HARD from round 5; separator ". " EASY / ", " HARD (pacing lever)
export function generateSequence(step: LadderStep, exclude: ReadonlySet<string>, rng?): string[];  // no dup words; relaxes exclusion if pool too small
export function normalizeTranscript(raw: string, opts: NormalizeOptions): NormalizedTranscript;    // lowercase, strip punctuation, split, bigram merge ("sand wich"), plural strip, drop fillers, snap to vocab (Levenshtein ≤1 only for len ≥5, off when STRICT_MATCH), collapse adjacent repeats
export function compareSequences(expected: readonly string[], heardVocabTokens: readonly string[]): CompareResult;  // ordered exact match; firstErrorIndex, missing, extra
export function scoreRound(i: { length, repeats, latencyMs, roundsClearedBefore, correct }, cfg?): ScoreBreakdown;   // base = length×10; speed bonus (<2 s: +5/word, <4 s: +2/word); streak +5 every 3 cleared; ×0.5 per repeat; 0 when wrong
export function evaluateAnswer(a: { expected, transcript, kind, repeats, latencyMs, roundsClearedBefore, strict }): Verdict;
```

Only tokens that snap to the vocabulary count; non-vocabulary tokens ("wait", "it was") are ignored. Zero vocabulary tokens in AWAITING_ANSWER = CHATTER (never scored). Transcript stored raw for audit.

## Voice bot (`voice-bot`)

**Turn-taking config** (`memory_bot/pipeline/turns.py`):
```python
LLMUserAggregatorParams(
    vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=cfg.vad_stop_secs)),           # 0.2
    user_turn_strategies=UserTurnStrategies(
        start=[MinWordsUserTurnStartStrategy(min_words=cfg.min_words_to_interrupt)],      # 2: "hmm" never interrupts a read-out; "wait wait" does
        stop=[TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3())],  # pauses between listed words do not end the turn
    ),
    user_turn_stop_timeout=cfg.user_turn_stop_timeout_secs,   # 2.0 watchdog
    user_idle_timeout=cfg.user_idle_timeout_secs,             # 8 -> on_user_turn_idle
)
```
Worker: `PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True), idle_timeout_secs=runner_args.pipeline_idle_timeout_secs, rtvi_observer_params=RTVIObserverParams(bot_output_enabled=False, bot_tts_enabled=False, bot_llm_enabled=False), app_resources={"gate": gate}, conversation_id=session_id)`. Observer text events off so sequence words never reach the browser (anti-cheat).

**Presentation** (`game/presenter.py`, invoked by the gate): push `PresentationStartFrame(round_id)` → `TTSSpeakFrame(separator.join(words) + ".", append_to_context=False)` → `PresentationEndFrame(round_id)`. `PresentationTrackerProcessor` (`game/tracker.py`, after `transport.output()`) consumes the sentinels once audio has played and calls `gate.on_presentation_started/finished`. Watchdog `2 s + 1.2 s × words`. Words never enter the LLM context.

**Gate concurrency rule**: `process_frame` never awaits network. On `LLMContextFrame` it snapshots the transcript, flips phase synchronously, and enqueues a job `(round_id, attempt_seq, kind)` on an `asyncio.Queue` consumed by a gate-owned task created on `StartFrame` (survives `InterruptionFrame` cancellation). Retries reuse the same `Idempotency-Key`; stale completions (gate moved on) are ignored. The gate never forwards the aggregator's `LLMContextFrame` in game phases; it appends a `[GAME EVENT]` system message to the shared `LLMContext` and pushes exactly one new `LLMContextFrame` (no double LLM runs). `speculation=True` frames are dropped with an error log.

**Phase table** (`BOOT → INTRO → PRESENTING → AWAITING_ANSWER → EVALUATING → REACTING → (PRESENTING | ENDING) → ENDED`; state: `phase, round, attempt_seq, presentation{started,finished,interrupted}, answer_started_at, pending_action ∈ {NONE, PRESENT_NEXT, REPRESENT, END}, awaiting_post_interrupt_turn, idle_nudges, bot_speaking`):

| Phase | Input | Action |
|---|---|---|
| BOOT | `on_client_ready` → `GameControlFrame(START)` | `set_bot_ready()`; send `game_state{intro}`; GAME_EVENT `GAME_START` → push `LLMContextFrame`; `pending_action=PRESENT_NEXT` → INTRO |
| INTRO / REACTING | `on_assistant_turn_stopped(interrupted=False)` | wait `bot_speaking==False` (+150 ms) then run `pending_action`: PRESENT_NEXT / REPRESENT → `present(round)`; END → final `game_state`, `pipeline_worker.end()` |
| INTRO / REACTING | `on_assistant_turn_stopped(interrupted=True)` | keep `pending_action`; `awaiting_post_interrupt_turn=True`; 3 s watchdog → if no user turn, run `pending_action` |
| INTRO / REACTING | `LLMContextFrame` | intent gate: REPEAT → `pending_action=REPRESENT` + phrase ack; QUIT → end flow; SCORE/HELP → phrase answer, then `pending_action`; else CHATTER → event + system note "reply in one short sentence, do not read any words" → push `LLMContextFrame` |
| PRESENTING | `present()` entry | reset presentation; push sentinels + `TTSSpeakFrame`; watchdog; `game_state{presenting}` |
| PRESENTING | tracker finished | job `POST presented`; → AWAITING_ANSWER; `idle_nudges=0`; `game_state{listening}` |
| PRESENTING | `InterruptionFrame` | `presentation.interrupted=True`; event INTERRUPTION; `game_state{interrupted}` |
| PRESENTING | `LLMContextFrame` (the interrupting turn) | REPEAT/QUIT/SCORE → as above with `pending_action=REPRESENT`; else if `vocab_tokens == round.sequence` → job `POST answer {answeredDuringPresentation:true}` → EVALUATING; else → job `POST repeat {INTERRUPTED}`, GAME_EVENT `INTERRUPTED` ("let me start that over") → REACTING, `pending_action=REPRESENT` |
| PRESENTING | watchdog | treat as finished, event BOT_ERROR |
| AWAITING_ANSWER | `UserStartedSpeakingFrame` | `answer_started_at` (first only) |
| AWAITING_ANSWER | `LLMContextFrame` | commands only if ≤1 vocab token: REPEAT → job repeat(REQUESTED) + ack → REACTING/REPRESENT; QUIT → end; SCORE/HELP → phrase, stay; GIVE_UP → job answer GIVE_UP; 0 vocab tokens → CHATTER ("no rush"), stay; else `attempt_seq+=1`, job `POST answer {ANSWER, latencyMs}` → EVALUATING, `game_state{evaluating}` |
| AWAITING_ANSWER | `on_user_turn_idle` | #1 phrase nudge (`TTSSpeakFrame`, ctx=False), event NUDGE; #2 job answer TIMEOUT → EVALUATING |
| EVALUATING | `LLMContextFrame` | drop (log CHATTER) — answer is locked |
| EVALUATING | verdict | apply numbers; `game_state{lastVerdict,...}`; `pending_action = END if gameOver else PRESENT_NEXT`; store `nextRound`; GAME_EVENT `ROUND_RESULT` (expected/heard on FAIL, next length, streak) → push `LLMContextFrame` → REACTING |
| EVALUATING | 409 IN_FLIGHT / network error | retry same key (200 ms ×5 / ×2); then phrase "lost my notes, let's redo that round" → job repeat(INTERRUPTED) → REPRESENT |
| EVALUATING | SESSION_ENDED / STALE_BOT | phrase goodbye → `pipeline_worker.end()` |
| any | `Bot{Started,Stopped}SpeakingFrame` (upstream) | track `bot_speaking` |
| any | RTVI `on_client_message(type="end_game")` | job `POST end {CLIENT_END}`; goodbye; `send_server_response(msg, {ok:true})` → ENDING |
| any | `on_client_disconnected` / worker `on_idle_timeout` | job `POST end {DISCONNECTED \| IDLE_TIMEOUT}` (skip if ended) → `worker.cancel()` |
| ENDING | `on_assistant_turn_stopped` | final `game_state{status,endReason,finalScore}`; `pipeline_worker.end()` → ENDED |

All other frames pass through unchanged.

**Intent gate** (`game/intents.py`, pure regex, runs before the LLM): REPEAT (`repeat|again|say that|one more time`), QUIT (`quit|stop the game|end the game|i'm done`), GIVE_UP (`give up|pass|skip|i forgot`), SCORE (`score|points`), HELP (`help|how does|rules`). Applied only when the utterance has ≤1 vocabulary token.

**Host** (`host/prompt.py`): "Max", upbeat quiz-show energy, ≤2 short sentences, varies reactions, uses only numbers from the GAME_EVENT, never says sequence words except when a FAIL event reveals them, ends reactions with a hand-off cue, calls tools only when the player asks. GAME_EVENT = `{"role":"system","content":"[GAME EVENT] type=ROUND_RESULT correct=true round=3 points=+35 score=80 streak=3 next_length=6\nReact in at most 2 sentences. Do not say any words of the sequence."}` (Gemini adapter converts mid-conversation system messages to user role; Groq/OpenAI accept them). `temperature 0.8`, `max_tokens 80`.

**Tools** (`host/tools.py`, direct functions registered via `LLMContext(tools=[...])`): `repeat_sequence`, `end_game`, `get_score`. Each only calls `params.app_resources["gate"].request_intent(intent, source="tool")` (idempotent per `(round_id, attempt_seq)`) and returns `result_callback({...}, properties=FunctionCallResultProperties(run_llm=False))`. Tools are never part of validation.

**Scripted host** (`host/scripted.py`, `HOST_MODE=scripted`): replaces the LLM processor; renders the last GAME_EVENT from `host/phrases.py` banks (`intro, correct[streak], wrong_reveal, timeout, give_up, repeat_ack, interrupted_ack, nudge, score, help, game_over, quit`; seeded RNG, no immediate repeats) as `LLMFullResponseStartFrame → LLMTextFrame → LLMFullResponseEndFrame` so TTS and the assistant aggregator behave identically (fallback: `TTSSpeakFrame(append_to_context=True)`).

**RTVI messages**: server→client `{ type:"game_state", phase, sessionId, round:{number,length,repeats}|null, score, roundsCleared, strikes, maxStrikes, status, lastVerdict|null, ended|null }` and `{ type:"host_line", text }` (from `on_assistant_turn_stopped` `message.content`). Client→server `sendClientRequest("end_game")`.

**bot.py**: `bot(runner_args)` → read `runner_args.body` (`{sessionId, clientToken}`), `POST attach` via `api/client.py` (on failure: minimal pipeline speaks a short error, ends), `pipeline/builder.py` assembles services (`pipeline/services.py`, `host/llm_factory.py`) and the pipeline, register `on_client_ready`/`on_client_message`/`on_client_connected`/`on_client_disconnected`/`on_idle_timeout`/`on_pipeline_finished` (closes httpx), run `WorkerRunner`. `if __name__ == "__main__": from pipecat.runner.run import main; main()`.

## Web (`web`)

API types come from the generated `shared/api/schema.d.ts` (never hand-written); the RTVI `game_state` type is generated from `contracts/rtvi/game-state.schema.json`. `shared/pipecat/client.ts`: `new PipecatClient({ transport: new SmallWebRTCTransport({ iceServers:[{ urls:"stun:stun.l.google.com:19302" }] }), enableMic:true, enableCam:false, callbacks })`; `client.connect({ webrtcRequestParams:{ endpoint: VITE_BOT_OFFER_URL, requestData:{ sessionId, clientToken } } })`. Events via `useRTVIClientEvent(RTVIEvent.ServerMessage | UserTranscript | BotStartedSpeaking | BotStoppedSpeaking | UserStartedSpeaking | UserStoppedSpeaking | Disconnected | Error)`; `PipecatClientProvider` + `PipecatClientAudio`.

`useGameSession` reducer: `idle → creating → connecting → playing → ended | error`. `usePolling(GET /sessions/:id, 3 s while playing, once on end)`; API view wins on conflict. Single page: StartCard (nickname) → GamePanel (round, score, strikes, StatusPill speaking/listening/thinking, TranscriptFeed of final user transcripts + host lines, VerdictBanner) → FinalResultCard; sidebar Leaderboard + RecentScores (poll 15 s); EndButton = `sendClientRequest("end_game")` with API `POST /sessions/:id/end` fallback. Tailwind only, minimal microcopy, no em dashes in UI copy.

## Environment, compose, Makefile

`api/.env.example`: `PORT=4000 DATABASE_URL=postgresql://mc:mc@localhost:5432/memorycard REDIS_URL=redis://localhost:6379 INTERNAL_API_TOKEN=change-me WEB_ORIGIN=http://localhost:5173 BOT_PUBLIC_URL=http://localhost:7860 SESSION_CACHE_TTL_SECONDS=1800 IDEMPOTENCY_TTL_SECONDS=3600 STALE_SESSION_MINUTES=10 MAX_STRIKES=1 MAX_ROUNDS=15 STRICT_MATCH=false LOG_LEVEL=info`

`voice-bot/.env.example`: `API_BASE_URL=http://localhost:4000 INTERNAL_API_TOKEN=change-me DEEPGRAM_API_KEY= LLM_PROVIDER=gemini GOOGLE_API_KEY= GROQ_API_KEY= OPENAI_API_KEY= LLM_MODEL= (defaults gemini-2.5-flash / llama-3.3-70b-versatile / gpt-4o-mini) HOST_MODE=llm TTS_VOICE=aura-2-thalia-en STT_MODEL=nova-3-general MIN_WORDS_TO_INTERRUPT=2 VAD_STOP_SECS=0.2 USER_TURN_STOP_TIMEOUT_SECS=2.0 USER_IDLE_TIMEOUT_SECS=8 PIPELINE_IDLE_TIMEOUT_SECS=300 PRESENTATION_WATCHDOG_EXTRA_SECS=2 PIPECAT_ALLOWED_ORIGINS=http://localhost:5173 PIPECAT_ICE_SERVERS=stun:stun.l.google.com:19302 LOG_LEVEL=INFO`

`web/.env.example`: `VITE_API_BASE_URL=http://localhost:4000 VITE_BOT_OFFER_URL=http://localhost:7860/api/offer VITE_POLL_MS=3000`

`docker-compose.yml` (repo root): `postgres:16-alpine` (healthcheck `pg_isready`, volume), `redis:7-alpine` (`--appendonly yes`, healthcheck). Profile `full`: `api` (runs `prisma migrate deploy` then start), `web` (nginx build), `bot` (`network_mode: host`, Linux only). On macOS the bot runs natively (`uv run bot.py -t webrtc`) because SmallWebRTC ICE fails without host networking.

Makefile: `infra-up`, `infra-down`, `db-migrate`, `api-dev`, `bot-dev`, `web-dev`, `contracts-emit` (Swagger → `contracts/openapi.json` → `web` TS types via `openapi-typescript` + `voice-bot` pydantic models via `datamodel-code-generator`), `contracts-check` (regenerate then `git diff --exit-code`), `lint`, `test`, `ci`, `demo`.

## Claude Code development layout (effective + resumable)

Verified against the official docs (code.claude.com/docs: memory, settings, skills, best-practices):
- `CLAUDE.md` loads from the cwd **and every ancestor directory** at launch; subdirectory `CLAUDE.md` files load on demand when files there are read. Target under 200 lines; put commands, conventions, gotchas; leave out anything derivable from code. `@path` imports load at launch (they cost context). HTML comments are stripped.
- `.claude/rules/*.md` with `paths:` frontmatter load only when matching files are touched. That is the documented tool for monorepos, so per-package guidance goes there instead of three nested `CLAUDE.md` files.
- `.claude/settings.json` (shared) is read from the session's primary working directory only; `.claude/settings.local.json` is personal. Hooks are the only deterministic mechanism; `CLAUDE.md` is advisory.
- Skills live at `.claude/skills/<name>/SKILL.md`, load on demand as `/name`; `disable-model-invocation: true` for side-effectful workflows.
- Auto memory is keyed by git repository, so `git init` is the first step of M0.
- Resumability: `claude --continue/--resume` restores a session, but the durable, git-tracked truth is a spec plus a state ledger in the repo. Best practice is "write the spec, execute it in a fresh session".

**Location consequence.** Inside `final h1 plan/` the 22.7 KB iQBG `CLAUDE.md` (Mongo, `org_id`, paper state machine rules) would load into every session of this project and its doc-drift hooks would fire on every edit. The repo therefore lives at `/Users/amritpalsingh/chats_only/memory-card-voice-bot/`, where the only ancestor memory file is the 276-byte `~/.claude/CLAUDE.md`. Development sessions are launched with the repo root as cwd. (Fallback if it must stay inside the workspace: `claudeMdExcludes: ["**/final h1 plan/CLAUDE.md"]` in the repo's `.claude/settings.json`, and still launch from the repo root.)

```
memory-card-voice-bot/
├── CLAUDE.md                        # ≤120 lines, checked in; imports @docs/STATE.md
├── CLAUDE.local.md                  # gitignored: personal notes (key locations, VPN quirks)
├── .claude/
│   ├── settings.json                # shared: permissions allow (make *, npm run *, npm test*, uv run *, docker compose ps/up -d*, git status/diff*, curl -s http://localhost*),
│   │                                #   deny (rm -rf *, git push --force*, prisma migrate reset*, docker compose down -v*), hooks below
│   ├── settings.local.json          # gitignored
│   ├── rules/
│   │   ├── api.md         paths: api/**            layering rule (infrastructure → application → domain), ports/adapters, Prisma migrate + emit-openapi workflow, test commands
│   │   ├── voice-bot.md   paths: voice-bot/**      Pipecat 1.9 names (PipelineWorker/WorkerRunner, no manual RTVIProcessor), never await network in process_frame, sentinel protocol, tuning knobs
│   │   ├── web.md         paths: web/**            generated API types only, pipecat client facts, design tokens, minimal microcopy, no em dashes
│   │   └── contracts.md   paths: contracts/**, web/src/shared/api/schema.d.ts, voice-bot/memory_bot/api/*_models.py   never hand-edit; run `make contracts-emit`
│   ├── skills/
│   │   ├── run-stack/SKILL.md       # infra-up → migrate → start api/bot/web → health checks (disable-model-invocation: true)
│   │   ├── verify-milestone/SKILL.md# runs the DoD checks for milestone $0 from docs/PLAN.md, writes result + next action into docs/STATE.md
│   │   └── resume/SKILL.md          # reads STATE.md, `git status`, service health; restates the next action before touching code
│   └── agents/plan-reviewer.md      # fresh-context reviewer: diff vs docs/PLAN.md, reports gaps only (adversarial review step from best-practices)
└── docs/
    ├── PLAN.md                      # this plan, copied into the repo (the spec)
    ├── STATE.md                     # ledger, ≤60 lines, current state only
    ├── ARCHITECTURE.md  RUNBOOK.md  DEMO-SCRIPT.md
    └── adr/
```

**Root `CLAUDE.md` outline** (each line must answer "would removing this cause a mistake?"):
1. What this is + the one core rule: validation is deterministic API code; the LLM never scores.
2. Commands: `make infra-up | db-migrate | api-dev | bot-dev | web-dev | contracts-emit | contracts-check | ci`; per-app test commands.
3. Layout in five lines + dependency rule + "generated files are never edited by hand".
4. Invariants: five no-double-score layers; sequence words never enter LLM context or the browser; gate never awaits network in `process_frame`; one `TTSSpeakFrame` per sequence.
5. Workflow: spec is `docs/PLAN.md`; update `docs/STATE.md` before ending any session; one commit per milestone (`feat(m3): …`); `make ci` before commit; `/clear` between milestones; "when compacting, preserve modified files, failing tests, and the STATE next action".
6. Gotchas: bot runs natively on macOS (no Docker ICE); Deepgram keyterm 500-token cap; MinWords(2) semantics; Pipecat pinned to 1.9.0.
7. `@docs/STATE.md`.

**`docs/STATE.md` format** (current state only, rewritten in place, never a changelog):
```
Milestone: M3 in progress        Done: M0 <sha> · M1 <sha> · M2 <sha>
Now: answer-race e2e failing (second submit gets 200 instead of replayed:true)
Next action: make Round CAS include CREATED status in updateMany where
Blocked: none
Last verified: make ci green at <sha>; DEMO-SCRIPT steps 1-3 pass, 4-9 not yet run
Env: DEEPGRAM/GOOGLE keys in voice-bot/.env; VPN not needed
```

**Hooks** (`.claude/settings.json`): `PostToolUse` on Edit/Write → `eslint --fix` / `ruff format` on the changed file; `Stop` → script that prints a reminder when code changed in the session but `docs/STATE.md` did not (advisory, not blocking). CI (`make ci`) is the pass/fail check Claude runs itself; the reviewer subagent is the second opinion before a milestone is marked done.

**Session loop**: launch in repo root → `CLAUDE.md` + `STATE.md` load → `/resume` → work the next action → `/verify-milestone Mn` → commit → `/clear`. Name sessions `/rename mcvb-m<n>`.

## Kickoff in a fresh session

A new session starts with empty context. Everything it needs is this plan, so the handoff is three steps.

**Step 1 (this session, on approval): handoff only, no code.** Create the folder, copy this plan in as the spec, init git, write the kickoff prompt file.
```bash
mkdir -p /Users/amritpalsingh/chats_only/memory-card-voice-bot/docs
cp "/Users/amritpalsingh/.claude/plans/backend-engineering-assignment-memory-synthetic-snowflake.md" /Users/amritpalsingh/chats_only/memory-card-voice-bot/docs/PLAN.md
cd /Users/amritpalsingh/chats_only/memory-card-voice-bot && git init -b main
```
Plus `docs/KICKOFF.md` containing the prompts below. Nothing else is built from the iQBG workspace session.

**Step 2 (you): prerequisites, then open the session in the repo.**
```bash
node -v            # 20.x (nvm use 20)
uv --version       # any recent
docker compose version
```
Keys to have ready: `DEEPGRAM_API_KEY`, `GOOGLE_API_KEY` (Gemini). Desktop app: New session → pick folder `/Users/amritpalsingh/chats_only/memory-card-voice-bot`. Terminal alternative: `cd` there and run `claude`. Run `/context` once; only `~/.claude/CLAUDE.md` should be listed until M0 creates the repo's own files.

**Step 3 (new session, first prompt = M0):**
```text
Read docs/PLAN.md in full before doing anything. It is the approved spec for this repo; follow it, do not redesign.
Execute milestone M0 exactly as its row specifies, including the Claude Code layer: CLAUDE.md (≤120 lines, outline in the plan), .claude/settings.json (permissions + hooks), .claude/rules/{api,voice-bot,web,contracts}.md with paths frontmatter, .claude/skills/{run-stack,verify-milestone,resume}/SKILL.md, .claude/agents/plan-reviewer.md, docs/STATE.md.
Pins: pipecat-ai==1.9.0, NestJS 11 + Fastify, Prisma + PostgreSQL 16, Redis 7, npm workspaces (api, web), uv for voice-bot, Node 20.
Verify the M0 definition of done with real commands, fill docs/STATE.md, commit as "feat(m0): scaffold", then stop. Do not start M1.
```

**Every later session:** `/resume` (created in M0), or paste:
```text
Read docs/STATE.md, then docs/PLAN.md. Continue from "Next action" for milestone M<n>. Verify that milestone's definition of done with real commands, update docs/STATE.md, commit "feat(m<n>): …", stop.
```
Use `/clear` between milestones and `/rename mcvb-m<n>` per session. Before marking a milestone done, run the `plan-reviewer` subagent on the diff against `docs/PLAN.md`.

## Milestones (dependency order)

| # | Milestone | Definition of done |
|---|---|---|
| M0 | `git init` first; flat layout, npm workspaces (api, web), `uv` project, root compose, `.env.example`s, Makefile, README, ADR stubs 0001–0006, `.github/workflows/ci.yml`; Claude Code layer: `CLAUDE.md`, `.claude/{settings.json,rules/*,skills/*,agents/*}`, `docs/PLAN.md` (copy of this plan), `docs/STATE.md` | `docker compose up -d` healthy; `npm run build -ws`, `uv sync`, CI lint job succeed; `/context` in a fresh session launched from the repo root lists only this repo's memory files plus `~/.claude/CLAUDE.md` |
| M1 | API foundation: zod env, Prisma schema + migration, ports + Prisma/Redis adapters (safe wrappers), `UnitOfWork`, pino, Swagger + `scripts/emit-openapi.ts`, domain-error filter, health, session use cases (`create`, `get`, `end`, `attach-bot`, `expire-stale`), internal guard, sweeper, `contracts-emit` wired | e2e: create → get (sequence hidden) → attach (401 bad token, 200 → IN_PROGRESS) → end idempotent; `/docs` renders; `contracts/openapi.json` committed and `contracts-check` green |
| M2 | Domain (`api/src/domain`) + unit tests | Lint rule blocks Nest/Prisma/Redis imports in `domain/`; full branch coverage on normalize/compare/score; property test on generator; golden cases ("apple, tiger, piano.", "um apple tiger… piano", "sand which", "apples", swapped order, extra word) |
| M3 | Round use cases (`next-round`, `mark-presented`, `submit-answer`, `repeat-round`, `record-event`), idempotency adapter, session cache, leaderboard | application tests vs in-memory ports (20 concurrent `submit-answer` → one accepted); e2e: same-key replay returns identical verdict, score unchanged; same race against real Postgres; Redis flushed mid-test → DB still blocks double score; leaderboard rebuilds on miss |
| M4 | Bot skeleton: `pipeline/{builder,turns,services}.py`, Deepgram STT/TTS, aggregators (MinWords + SmartTurn), echo host, `PipelineWorker`/`WorkerRunner`, RTVI ready, generated `api/models.py`, `/client` prebuilt UI works | Talk to it in the browser; logs show `LLMContextFrame` with transcript; interruption stops audio |
| M5 | Game loop in scripted mode: `api/client.py`, `frames.py`, `game/{state,intents,gate,presenter,tracker}.py`, `host/{phrases,scripted}.py` | 3+ rounds end-to-end with `HOST_MODE=scripted`; pytest covers every phase-table row with a fake API + captured frames; sentinel ordering test |
| M6 | LLM host: `host/llm_factory.py` (gemini/groq/openai), `host/prompt.py`, `host/tools.py` via `app_resources`, GAME_EVENT flow, observer text suppression | Plays with each provider; "say it once more?" triggers the tool exactly once; unit test asserts no LLM frame is pushed before the API verdict |
| M7 | Interruption + robustness: PRESENTING/REACTING interruption paths, watchdogs, idle nudge/timeout, end_game message, disconnect/idle end, API retries | DEMO-SCRIPT passes 3× in a row; "hmm" during read-out ignored; "wait wait" interrupts <300 ms; full correct answer during read-out accepted |
| M8 | Web UI (`features/*`, generated API types, RTVI schema type) | Full game from UI incl. final card, leaderboard/recent, End button; polling reconciles after a forced bot kill; visually verified in browser preview |
| M9 | Docs (ARCHITECTURE, RUNBOOK, DEMO-SCRIPT, ADRs finalised), compose full profile, README | Fresh clone → README only → playable in <10 min; `make ci` green locally and on GitHub Actions |

## Tests

| Layer | Tool | Cases |
|---|---|---|
| Domain unit | Jest | ladder; generator exclusions + seeded determinism; normalizer (punctuation, fillers, plurals, bigram merge, Levenshtein snap only len≥5, STRICT_MATCH); comparer; scoring; session/round transition guards |
| Application | Jest, in-memory ports | every use case; `submit-answer` replay, Round/Session CAS, 20 concurrent submits → one accepted; view mapper hides open sequence |
| API e2e (real PG + Redis via compose) | Jest + supertest/Fastify inject | lifecycle; attach auth; `next`/`presented` idempotent; answer replay; **concurrent race**; Round CAS on EVALUATED; session version CAS; TIMEOUT/GIVE_UP; game over on strikes and on MAX_ROUNDS; leaderboard/recent + rebuild on flush; sweeper; guard 401; CORS; health degraded when Redis down |
| Bot unit | pytest | intent regex positives/negatives + vocab-token guard; phrase bank no immediate repeats; `state.to_rtvi()` |
| Bot integration | pytest-asyncio, `FakeApiClient`, gate wired to a capturing sink | every phase-table row; interruption during PRESENTING → repeat; full-correct-during-presentation → answer; EVALUATING drops chatter; idle nudge then TIMEOUT; IN_FLIGHT retry; network error → represent; end_game; speculative frame dropped |
| Bot live smoke (marked `live`) | pytest | real Deepgram: `TTSSpeakFrame` + sentinels preserve order through TTS + fake output |
| Web | Vitest + RTL | reducer; server-message vs poll precedence; End button paths |

## Verification (end-to-end) and demo script (`docs/DEMO-SCRIPT.md`)

1. `make infra-up && make db-migrate`; start API, bot (`uv run bot.py -t webrtc`, `HOST_MODE=llm`, `LLM_PROVIDER=gemini`), web. Show `/docs` and `/health`.
2. Nickname → Start. UI goes `connecting → intro`; host greets by name.
3. Round 1: answer with natural pauses between words; not cut off (Smart Turn); verdict + score.
4. Round 2: say "hmm" while the bot reads; it keeps reading (MinWords=2). Answer, win.
5. Round 3: mid-sequence say "wait wait, say that again": audio stops within a beat, UI shows `interrupted`, host acknowledges, re-reads from the top (repeat=1, points halved). Answer.
6. Round 4: interrupt the host's *reaction* with "what's my score?": bot stops, answers, then presents the next sequence (state-driven recovery).
7. Round 5: answer wrong: host reveals expected vs heard; game over; final card; leaderboard updates.
8. Terminal proof: `psql` on `Round`/`Response` (one accepted response per round); `curl` the answer endpoint twice with the same `Idempotency-Key` → `replayed:true`, score unchanged; `redis-cli keys 'mc:*'` shows session cache, idem keys, leaderboard ZSET.
9. Second session with `HOST_MODE=scripted` and no LLM key to show the fallback host.

Automated: `make ci` = lint + `contracts-check` + API domain/application unit + e2e (compose), bot pytest, web vitest; same jobs in `.github/workflows/ci.yml`. UI checked in the in-app browser preview at each web milestone.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Smart Turn ends a listed answer early or waits too long | `USER_TURN_STOP_TIMEOUT_SECS=2.0`; comparer ignores non-vocab tokens; `TURN_STOP_STRATEGY=speech_timeout` fallback (`SpeechTimeoutUserTurnStopStrategy(1.2)`) documented in RUNBOOK |
| Deepgram mishears vocabulary | keyterm boosting (~80 words, trim to 50 if the 500-token limit trips), Levenshtein ≤1 snap, bigram merge, distinct-sounding vocabulary |
| LLM reads the words or invents a verdict | words never in context, GAME_EVENT carries the verdict, prompt forbids repeating words, observer text off, validation path has zero LLM dependency |
| Free-tier LLM latency/quota | short prompts, `max_tokens 80`; scripted fallback; per-provider model override |
| Bot audio echoed back as user speech | browser AEC, MinWords=2 while bot speaks, non-vocab tokens ignored |
| Semi-internal Pipecat behaviour changes | pinned `pipecat-ai==1.9.0`; every reliance isolated in `pipeline/`, `game/tracker.py`, `host/scripted.py` |
| ICE failures (VPN) | `PIPECAT_ICE_SERVERS` + client `iceServers`; RUNBOOK TURN notes |
| Redis outage | all cache calls wrapped; DB truth; unique index + CAS still enforce single scoring |
| iQBG workspace context bleed | repo lives outside the workspace; development sessions launch from the repo root so only its own `CLAUDE.md`, rules, settings, and hooks load. Scaffolding M0 from this session is fine (this workspace's hook nudges are advisory); everything after M0 runs in a fresh session in the repo |

## Verify at implementation (collected from source review, cheap to confirm on first run)

1. `LocalSmartTurnAnalyzerV3` import path `pipecat.audio.turn.smart_turn.local_smart_turn_v3`; no extra beyond core `onnxruntime`.
2. `MinWordsUserTurnStartStrategy` sees `Bot{Started,Stopped}SpeakingFrame` during presentation (log once).
3. Whether transcript text received before MinWords fires is included in the aggregated user text (comparer is robust either way).
4. `on_client_message` `ClientMessage` type import path (type hints only).
5. `PipelineWorker.end()` from an aggregator event handler drains cleanly; fallback `worker.queue_frame(EndFrame())`.
6. `worker.queue_frame(GameControlFrame)` passes through STT and the user aggregator unchanged.
7. `ScriptedHostProcessor` LLM-frame emulation triggers `on_assistant_turn_stopped` like a real LLM; fallback `TTSSpeakFrame(append_to_context=True)`.
8. Aura-2 pause lengths for `". "` vs `", "`; adjust separators or `speed` if too fast.
9. `GoogleLLMService.Settings(model=...)` accepted; Groq accepts mid-conversation `system` role.
10. `runner_args.body` carries `{sessionId, clientToken}` from the JS transport's `requestData` (log on first connection).
11. Runner CORS for `PATCH /api/offer` (ICE trickle) from origin 5173.

## Key code shape (bot assembly)

```python
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker, PipelineParams
from pipecat.workers.runner import WorkerRunner
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transports.base_transport import TransportParams
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.deepgram.tts import DeepgramTTSService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.turns.user_start.min_words_user_turn_start_strategy import MinWordsUserTurnStartStrategy
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import TurnAnalyzerUserTurnStopStrategy

worker = PipelineWorker(
    pipeline,
    params=PipelineParams(enable_metrics=True),
    idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    rtvi_observer_params=RTVIObserverParams(bot_output_enabled=False, bot_tts_enabled=False, bot_llm_enabled=False),
    app_resources={"gate": gate},
    conversation_id=session_id,
)

@worker.rtvi.event_handler("on_client_ready")
async def _(rtvi):
    await rtvi.set_bot_ready()
    await worker.queue_frame(GameControlFrame(action="start"))

runner = WorkerRunner(handle_sigint=runner_args.handle_sigint, handle_sigterm=runner_args.handle_sigterm)
await runner.add_workers(worker)
await runner.run()
```

```python
async def repeat_sequence(params: FunctionCallParams) -> None:
    """Repeat the current round's word sequence. Call only when the player explicitly asks to hear the words again."""
    params.app_resources["gate"].request_intent(Intent.REPEAT, source="tool")
    await params.result_callback({"ok": True}, properties=FunctionCallResultProperties(run_llm=False))
```

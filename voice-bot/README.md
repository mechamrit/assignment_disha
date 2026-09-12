# voice-bot

Python 3.11 service on Pipecat 1.9.0. It owns the voice side of the game: WebRTC audio with the browser, Deepgram speech-to-text and text-to-speech, turn-taking, reading sequences aloud, and the host persona. Every game decision (next round, verdict, score, game over) comes from the API's internal endpoints; the bot never scores.

The pipeline, the phase table, and the turn-taking settings are specified under "Voice bot" in `docs/PLAN.md`.

## Setup

Needs uv 0.11.8 or newer (`pyproject.toml` enforces it).

```bash
cd voice-bot
uv sync --locked
cp .env.example .env
```

`uv sync --locked` creates `.venv` with Python 3.11 and installs exactly the tree in `uv.lock`, dev tools included. It fails instead of re-resolving when `pyproject.toml` and `uv.lock` disagree.

Speech needs `DEEPGRAM_API_KEY` in `.env`. Without it the bot builds and its tests run, but starting it raises `MissingDeepgramKeyError` as soon as a caller connects.

## Commands

From `voice-bot/`:

| Command | Does |
|---|---|
| `uv run pytest` | Tests, skipping those marked `live` |
| `uv run pytest -m live` | Only tests that call real services; they need API keys |
| `uv run ruff check .` | Lint |
| `uv run ruff format --check .` | Formatting check; `uv run ruff format .` applies it |
| `uv add 'package==X.Y.Z'` | Add a dependency with an exact pin and update `uv.lock` |

`make bot-dev` from the repo root runs `uv run bot.py -t webrtc`, which serves the SmallWebRTC runner and its prebuilt client on port 7860.

## Package layout

Files in this tree:

| Path | Role |
|---|---|
| `bot.py` | Runner entry. The runner calls `bot(runner_args)` per connection, with `{sessionId, clientToken}` in `runner_args.body` |
| `memory_bot/config.py` | Typed settings; `HOST_MODE=llm` falls back to `scripted` when the provider key is empty |
| `memory_bot/pipeline/builder.py` | Frame order and the `PipelineWorker`, with injectable services so tests need no keys |
| `memory_bot/pipeline/turns.py` | Turn-taking: two words to interrupt, Smart Turn to end a turn |
| `memory_bot/pipeline/services.py` | Deepgram speech-to-text (keyterm boosted) and text-to-speech |
| `memory_bot/host/echo.py` | Scaffolding host that repeats what it heard, so the pipeline can be exercised without an LLM |
| `memory_bot/api/client.py` | Async client for the internal endpoints, including the idempotency key for answers |
| `memory_bot/api/errors.py` | API error codes as types the phase machine can branch on |
| `tests/` | `unit/` (settings, turn strategies, pipeline assembly, Pipecat surface), `integration/` (API client against a stub transport) |

Still to come, from `docs/PLAN.md`: `memory_bot/frames.py` (presentation sentinels), `memory_bot/game/` (phase machine, presenter, tracker, intents), the scripted and LLM hosts under `memory_bot/host/`, and `memory_bot/api/models.py` generated from `contracts/openapi.json`.

The rules for this package are in `.claude/rules/voice-bot.md`.

## Configuration

`.env.example` lists every variable:

| Variable | Meaning |
|---|---|
| `API_BASE_URL`, `INTERNAL_API_TOKEN` | API location and the shared secret for its internal endpoints |
| `DEEPGRAM_API_KEY` | Speech-to-text and text-to-speech |
| `LLM_PROVIDER`, `LLM_MODEL` | `gemini`, `groq`, or `openai`; an empty model uses the provider default |
| `GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` | Key for the selected provider |
| `HOST_MODE` | `llm` or `scripted`; `llm` falls back to `scripted` when the provider key is empty |
| `TTS_VOICE`, `STT_MODEL` | Deepgram voice and recognition model |
| `MIN_WORDS_TO_INTERRUPT` | Words the player must say to interrupt the bot while it speaks |
| `VAD_STOP_SECS`, `USER_TURN_STOP_TIMEOUT_SECS` | Silence that ends a user turn, and the fallback timeout |
| `USER_IDLE_TIMEOUT_SECS` | Silence before the idle nudge |
| `PIPELINE_IDLE_TIMEOUT_SECS` | Inactivity before the pipeline shuts down |
| `PRESENTATION_WATCHDOG_EXTRA_SECS` | Slack added to the read-out watchdog |
| `PIPECAT_ALLOWED_ORIGINS`, `PIPECAT_ICE_SERVERS` | Browser origins the runner accepts, and the ICE servers. The Pipecat runner accepts every origin when no allowed origins are passed to it |
| `LOG_LEVEL` | Log level |

`.env` holds provider keys: it is gitignored, and the Claude Code settings deny reading it.

## Docker

The image installs the locked tree with uv (the download cache stays in a BuildKit cache mount, out of the image layers) and runs `bot.py` as the unprivileged `app` user through the runner on 127.0.0.1:7860. Compose runs it with host networking, which Docker provides on Linux only, so on macOS run the bot natively.

## Without uv

`--group` needs pip 25.1 or newer, and the pip bundled with Python 3.11 is older, so upgrade it first:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install pip==26.2.1
pip install -e . --group dev
```

pip honours only the direct pins in `pyproject.toml`; transitive versions can differ from `uv.lock`.

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

`uv sync --locked` creates `.venv` with Python 3.11 (uv downloads it when missing) and installs exactly the tree in `uv.lock`, dev tools included. It fails instead of re-resolving when `pyproject.toml` and `uv.lock` disagree.

## Commands

From `voice-bot/`:

| Command | Does |
|---|---|
| `uv run pytest` | Tests, skipping those marked `live` |
| `uv run pytest -m live` | Only tests that call real services; they need API keys |
| `uv run ruff check .` | Lint |
| `uv run ruff format --check .` | Formatting check; `uv run ruff format .` applies it |
| `uv add 'package==X.Y.Z'` | Add a dependency with an exact pin and update `uv.lock` |

`make bot-dev` from the repo root is the entry point for running the bot with the SmallWebRTC runner on port 7860. In this tree it is a stub that prints the milestone delivering `bot.py` (M4) and exits 1.

## Package layout

Files in this tree:

| Path | Role |
|---|---|
| `pyproject.toml` | Dependencies (`pipecat-ai` with its extras), the `dev` group, the uv version floor, ruff and pytest settings |
| `uv.lock` | Full pinned dependency tree |
| `memory_bot/__init__.py` | Package root |
| `tests/unit/test_pipecat_surface.py` | Fails when the Pipecat pin changes or an import path the plan relies on moves |

Target layout from `docs/PLAN.md` (a module appears with its first file):

| Path | Holds |
|---|---|
| `bot.py` | Runner entry: attaches to the session through the API, builds the pipeline, runs the worker |
| `memory_bot/config.py` | Typed settings read from the environment |
| `memory_bot/frames.py` | Presentation sentinel frames and game control frames |
| `memory_bot/pipeline/` | Pipeline assembly, turn strategies, service factories; the only place Pipecat service classes are imported |
| `memory_bot/game/` | Phase machine (the gate), sequence presenter, presentation tracker, intent matching |
| `memory_bot/host/` | Host prompt, phrase bank, scripted host, LLM tools, LLM provider factory |
| `memory_bot/api/` | API client and the models generated from `contracts/` |
| `tests/` | `unit/`, `integration/` (fake API and captured frames), `live/` |

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

No code in this tree reads these variables. `.env` holds provider keys: it is gitignored, and the Claude Code settings deny reading it.

## Docker

The image installs the locked tree with uv (the download cache stays in a BuildKit cache mount, out of the image layers) and runs `bot.py` as the unprivileged `app` user through the runner on 127.0.0.1:7860. Compose runs it with host networking, which Docker provides on Linux only, so on macOS run the bot natively. Without `bot.py` the container exits with `Failed to spawn: bot.py`.

## Without uv

`--group` needs pip 25.1 or newer, and the pip bundled with Python 3.11 is older, so upgrade it first:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install pip==26.2.1
pip install -e . --group dev
```

pip honours only the direct pins in `pyproject.toml`; transitive versions can differ from `uv.lock`.

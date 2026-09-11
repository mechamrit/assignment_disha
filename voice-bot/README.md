# voice-bot

Pipecat 1.9.0 voice I/O for the Memory Card game: Deepgram speech-to-text and text-to-speech, turn-taking, and the game phase machine. Every game decision comes from the API's internal endpoints; the bot never scores.

## Setup

```bash
uv sync
cp .env.example .env
```

`uv sync` creates `.venv` with Python 3.11 and the full dependency tree pinned in `uv.lock`.

Without uv (pip 25.1 or newer for `--group`):

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e . --group dev
```

pip resolves only the direct pins in `pyproject.toml`; transitive versions can differ from `uv.lock`.

## Commands

```bash
uv run pytest
uv run pytest -m live
uv run ruff check .
uv run ruff format --check .
```

`-m live` runs only tests that call real services and need API keys; the default run skips them.

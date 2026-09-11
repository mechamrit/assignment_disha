---
paths:
  - "voice-bot/**"
---

# voice-bot rules

- Pipecat is pinned to `pipecat-ai==1.9.0`. Use `pipecat.pipeline.worker.PipelineWorker` and `pipecat.workers.runner.WorkerRunner`; `PipelineTask` and `PipelineRunner` are deprecated aliases.
- `PipelineWorker(enable_rtvi=True)` prepends `RTVIProcessor` itself; reach it through `worker.rtvi`. Never add `RTVIProcessor` to the pipeline list.
- Pipecat service and strategy classes are imported only in `memory_bot/pipeline/`. Other reliance on Pipecat internals lives only in `game/tracker.py` and `host/scripted.py`.
- The bot never scores and never decides an outcome. Every game decision is an API call through `memory_bot/api/client.py`.
- `process_frame` never awaits network I/O (`FrameProcessor` cancels its task on `InterruptionFrame`). Snapshot the data, flip the phase synchronously, and enqueue a job on the gate-owned `asyncio.Queue`, whose consumer task is created on `StartFrame`.
- Retries reuse the same `Idempotency-Key` (`<roundId>:<attemptSeq>`). Ignore completions for a round the gate has moved past.
- Presentation: `PresentationStartFrame(round_id)`, one `TTSSpeakFrame(separator.join(words) + ".", append_to_context=False)`, `PresentationEndFrame(round_id)`. `PresentationTrackerProcessor` sits after `transport.output()`. An `InterruptionFrame` with no end sentinel means the read-out was cut off. Watchdog: 2 s + 1.2 s per word.
- Sequence words never enter `LLMContext`, and the RTVI observer keeps `bot_output_enabled`, `bot_tts_enabled`, and `bot_llm_enabled` set to `False`.
- In game phases the gate never forwards the aggregator's `LLMContextFrame`: it appends one `[GAME EVENT]` system message and pushes exactly one new `LLMContextFrame`. Frames with `speculation=True` are dropped with an error log.
- Tuning knobs are env settings: `MIN_WORDS_TO_INTERRUPT=2`, `VAD_STOP_SECS=0.2`, `USER_TURN_STOP_TIMEOUT_SECS=2.0`, `USER_IDLE_TIMEOUT_SECS=8`, `PRESENTATION_WATCHDOG_EXTRA_SECS=2`.
- `memory_bot/api/models.py` and `memory_bot/api/rtvi_models.py` are generated; never edit them by hand.
- Commands, from `voice-bot/`: `uv sync`, `uv run pytest`, `uv run pytest -m live` (real Deepgram, needs keys), `uv run ruff check .`, `uv run ruff format --check .`. Add a dependency with an exact pin: `uv add 'package==X.Y.Z'`.

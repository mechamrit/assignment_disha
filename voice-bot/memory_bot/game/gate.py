"""The phase machine that runs a game.

Two rules shape this file:

* `process_frame` never awaits the network. Pipecat cancels a processor's frame task on an
  interruption, so an HTTP call made inside it would be lost half way. Instead the gate snapshots
  what it needs, flips the phase synchronously, and puts a job on a queue drained by a task that is
  created on `StartFrame` and survives interruptions.
* The API decides the game. The gate never judges an answer; it reports what was heard and copies
  the numbers from the verdict it gets back.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from loguru import logger
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    CancelFrame,
    EndFrame,
    Frame,
    InterruptionFrame,
    LLMContextFrame,
    StartFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
    UserStartedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.api.client import GameApiClient
from memory_bot.api.errors import ApiError, InFlightError, SessionEndedError, StaleBotError
from memory_bot.frames import GameControlFrame
from memory_bot.game.intents import Intent, count_vocab_words, match_intent
from memory_bot.game.presenter import present_sequence
from memory_bot.game.state import GameState, PendingAction, Phase, RoundState
from memory_bot.host.scripted import ScriptedHost

IN_FLIGHT_RETRY_SECONDS = 0.2
IN_FLIGHT_MAX_RETRIES = 5


@dataclass
class Job:
    """Network work queued from `process_frame`, run by the gate's own task."""

    kind: str
    payload: dict[str, Any] = field(default_factory=dict)


class GameGateProcessor(FrameProcessor):
    """Owns the phase, the round, and every call to the game API."""

    def __init__(
        self,
        *,
        client: GameApiClient,
        session_id: str,
        bot_instance_id: str,
        host: ScriptedHost,
        vocabulary: list[str],
        presentation_watchdog_extra_secs: float = 0.0,
        send_game_state: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._bot_instance_id = bot_instance_id
        self._host = host
        self._vocabulary = vocabulary
        self._watchdog_extra = presentation_watchdog_extra_secs
        self._send_game_state = send_game_state

        self.state = GameState(session_id=session_id)
        self._jobs: asyncio.Queue[Job] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None
        self._turn_text: list[str] = []

    # ------------------------------------------------------------------ frames

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, StartFrame):
            self._start_worker()
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, (EndFrame, CancelFrame)):
            await self._stop_worker()
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, GameControlFrame):
            self._enqueue("START_GAME")
            return

        if isinstance(frame, BotStartedSpeakingFrame):
            self.state.bot_speaking = True

        elif isinstance(frame, BotStoppedSpeakingFrame):
            self.state.bot_speaking = False
            if self.state.phase in (Phase.INTRO, Phase.REACTING):
                self._enqueue("RUN_PENDING")

        elif isinstance(frame, UserStartedSpeakingFrame):
            if self.state.phase is Phase.AWAITING_ANSWER and self.state.answer_started_at is None:
                self.state.answer_started_at = time.monotonic()

        elif isinstance(frame, InterruptionFrame):
            if self.state.phase is Phase.PRESENTING:
                self.state.presentation.interrupted = True

        elif isinstance(frame, TranscriptionFrame) and frame.text.strip():
            self._turn_text.append(frame.text.strip())

        elif isinstance(frame, LLMContextFrame):
            # A finished user turn. Decide synchronously, do the network work on the queue, and
            # swallow the frame: the host speaks from game events, not from the raw turn.
            self._handle_user_turn()
            return

        await self.push_frame(frame, direction)

    # ------------------------------------------------- presentation callbacks

    async def on_presentation_started(self, round_id: str) -> None:
        self.state.presentation.started = True
        self.state.presentation.round_id = round_id

    async def on_presentation_finished(self, round_id: str) -> None:
        self.state.presentation.finished = True
        self._enqueue("PRESENTED", {"roundId": round_id})

    async def on_presentation_interrupted(self, round_id: str) -> None:
        self.state.presentation.interrupted = True
        self._enqueue("INTERRUPTED", {"roundId": round_id})

    # ------------------------------------------------------------- turn logic

    def _handle_user_turn(self) -> None:
        """Classifies the finished turn and queues the call it needs. Never awaits."""
        transcript = " ".join(self._turn_text).strip()
        self._turn_text.clear()

        if not transcript:
            return

        vocab_words = count_vocab_words(transcript, self._vocabulary)
        intent = match_intent(transcript, vocab_words)
        logger.info("user turn {!r} -> {} in phase {}", transcript, intent, self.state.phase)

        if self.state.phase is Phase.EVALUATING:
            # The answer is locked; anything said now is talk.
            self._enqueue("EVENT", {"type": "CHATTER", "transcript": transcript})
            return

        if intent is Intent.QUIT:
            self.state.phase = Phase.ENDING
            self._enqueue("QUIT")
            return

        if intent is Intent.REPEAT:
            self.state.pending_action = PendingAction.REPRESENT
            self._enqueue("REPEAT", {"reason": "REQUESTED"})
            return

        if intent is Intent.SCORE:
            self._enqueue(
                "SAY",
                {"type": "SCORE", "score": self.state.score, "rounds": self.state.rounds_cleared},
            )
            return

        if intent is Intent.HELP:
            self._enqueue("SAY", {"type": "HELP"})
            return

        if intent is Intent.GIVE_UP and self.state.round:
            self.state.phase = Phase.EVALUATING
            self._enqueue("ANSWER", {"kind": "GIVE_UP", "transcript": transcript})
            return

        if intent is Intent.CHATTER:
            self._enqueue("EVENT", {"type": "CHATTER", "transcript": transcript})
            return

        if self.state.round is None:
            return

        latency_ms = self._latency_ms()
        if self.state.phase is Phase.PRESENTING:
            # The player answered over the read-out. The API decides whether it was right.
            self.state.phase = Phase.EVALUATING
            self._enqueue(
                "ANSWER",
                {
                    "kind": "ANSWER",
                    "transcript": transcript,
                    "latencyMs": latency_ms,
                    "duringPresentation": True,
                },
            )
            return

        self.state.phase = Phase.EVALUATING
        self._enqueue(
            "ANSWER", {"kind": "ANSWER", "transcript": transcript, "latencyMs": latency_ms}
        )

    def _latency_ms(self) -> int | None:
        if self.state.answer_started_at is None:
            return None
        return int((time.monotonic() - self.state.answer_started_at) * 1000)

    # ------------------------------------------------------------ job handling

    def _enqueue(self, kind: str, payload: dict[str, Any] | None = None) -> None:
        self._jobs.put_nowait(Job(kind=kind, payload=payload or {}))

    def _start_worker(self) -> None:
        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._run_jobs())

    async def _stop_worker(self) -> None:
        if self._worker is not None:
            self._worker.cancel()
            self._worker = None

    async def _run_jobs(self) -> None:
        while True:
            job = await self._jobs.get()
            try:
                await self._run_job(job)
            except (SessionEndedError, StaleBotError) as error:
                logger.info("game over for this bot: {}", error)
                self.state.phase = Phase.ENDING
                await self._say(
                    {
                        "type": "GAME_OVER",
                        "score": self.state.score,
                        "rounds": self.state.rounds_cleared,
                    }
                )
            except ApiError as error:
                logger.error("api call failed: {}", error)
            except asyncio.CancelledError:
                raise
            except Exception as error:  # noqa: BLE001 - a bot must not die on one bad turn
                logger.exception("job {} failed: {}", job.kind, error)
            finally:
                self._jobs.task_done()

    async def _run_job(self, job: Job) -> None:
        if job.kind == "START_GAME":
            await self._say({"type": "GAME_START"})
            self.state.phase = Phase.INTRO
            self.state.pending_action = PendingAction.PRESENT_NEXT
            await self._publish_state()

        elif job.kind == "RUN_PENDING":
            await self._run_pending_action()

        elif job.kind == "PRESENTED":
            await self._client.mark_presented(
                self.state.session_id, job.payload["roundId"], self._bot_instance_id
            )
            self.state.phase = Phase.AWAITING_ANSWER
            self.state.idle_nudges = 0
            await self._publish_state()

        elif job.kind == "INTERRUPTED":
            await self._client.record_event(
                self.state.session_id,
                self._bot_instance_id,
                "INTERRUPTION",
                {"roundId": job.payload.get("roundId")},
            )

        elif job.kind == "REPEAT":
            await self._repeat_round(str(job.payload.get("reason", "REQUESTED")))

        elif job.kind == "ANSWER":
            await self._submit_answer(job.payload)

        elif job.kind == "EVENT":
            await self._client.record_event(
                self.state.session_id,
                self._bot_instance_id,
                str(job.payload.get("type", "EVENT")),
                job.payload,
            )

        elif job.kind == "SAY":
            await self._say(job.payload)

        elif job.kind == "QUIT":
            await self._client.end_session(self.state.session_id, "QUIT", self._bot_instance_id)
            await self._say({"type": "QUIT"})
            self.state.phase = Phase.ENDED
            await self._publish_state()

        elif job.kind == "NUDGE":
            self.state.idle_nudges += 1
            if self.state.idle_nudges == 1:
                await self.push_frame(
                    TTSSpeakFrame(text="Whenever you are ready.", append_to_context=False),
                    FrameDirection.DOWNSTREAM,
                )
                await self._client.record_event(
                    self.state.session_id, self._bot_instance_id, "NUDGE", {}
                )
            else:
                self.state.phase = Phase.EVALUATING
                await self._submit_answer({"kind": "TIMEOUT", "transcript": ""})

    async def _run_pending_action(self) -> None:
        action, self.state.pending_action = self.state.pending_action, PendingAction.NONE

        if action is PendingAction.PRESENT_NEXT:
            await self._present_next_round()
        elif action is PendingAction.REPRESENT and self.state.round:
            await self._present(self.state.round)
        elif action is PendingAction.END:
            self.state.phase = Phase.ENDED
            await self._publish_state()

    async def _present_next_round(self) -> None:
        payload = await self._client.next_round(self.state.session_id, self._bot_instance_id)
        round_state = RoundState.from_api(payload["round"])
        self.state.start_round(round_state)
        await self._present(round_state)

    async def _present(self, round_state: RoundState) -> None:
        self.state.phase = Phase.PRESENTING
        self.state.presentation.reset(round_state.id)
        await self._publish_state()
        await present_sequence(self, round_state, self._watchdog_extra)

    async def _repeat_round(self, reason: str) -> None:
        if not self.state.round:
            return

        payload = await self._client.repeat_round(
            self.state.session_id,
            self.state.round.id,
            self._bot_instance_id,
            reason,  # type: ignore[arg-type]
        )
        self.state.round = RoundState.from_api(payload["round"])
        await self._say({"type": "REPEAT_ACK" if reason == "REQUESTED" else "INTERRUPTED"})
        self.state.phase = Phase.REACTING
        self.state.pending_action = PendingAction.REPRESENT

    async def _submit_answer(self, payload: dict[str, Any]) -> None:
        if not self.state.round:
            return

        attempt_seq = self.state.next_attempt()
        verdict = await self._submit_with_retry(payload, attempt_seq)
        if verdict is None:
            return

        self.state.apply_verdict(verdict)
        await self._publish_state()

        await self._say(
            {
                "type": "ROUND_RESULT",
                "outcome": verdict.get("outcome"),
                "points": verdict.get("points", {}).get("total", 0),
                "roundsCleared": self.state.rounds_cleared,
                "expected": verdict.get("expected", []),
                "heard": verdict.get("heardTokens", []),
                "gaveUp": payload.get("kind") == "GIVE_UP",
            }
        )

        self.state.phase = Phase.REACTING
        if verdict.get("gameOver"):
            await self._say(
                {
                    "type": "GAME_OVER",
                    "score": self.state.score,
                    "rounds": self.state.rounds_cleared,
                }
            )
            self.state.pending_action = PendingAction.END
        else:
            next_round = verdict.get("nextRound")
            if next_round:
                self.state.start_round(RoundState.from_api(next_round))
            self.state.pending_action = PendingAction.PRESENT_NEXT

    async def _submit_with_retry(
        self, payload: dict[str, Any], attempt_seq: int
    ) -> dict[str, Any] | None:
        """Retries only IN_FLIGHT, and always with the same attempt, so scoring stays idempotent."""
        assert self.state.round is not None

        for attempt in range(IN_FLIGHT_MAX_RETRIES):
            try:
                return await self._client.submit_answer(
                    self.state.session_id,
                    self.state.round.id,
                    self._bot_instance_id,
                    attempt_seq=attempt_seq,
                    kind=payload.get("kind", "ANSWER"),  # type: ignore[arg-type]
                    transcript=str(payload.get("transcript", "")),
                    latency_ms=payload.get("latencyMs"),
                    answered_during_presentation=bool(payload.get("duringPresentation", False)),
                )
            except InFlightError:
                logger.debug("answer still being scored, retry {}", attempt + 1)
                await asyncio.sleep(IN_FLIGHT_RETRY_SECONDS)

        logger.warning("gave up waiting for a verdict; asking for the round again")
        await self._repeat_round("INTERRUPTED")
        return None

    # ---------------------------------------------------------------- helpers

    async def _say(self, event: dict[str, Any]) -> None:
        await self._host.say_event(event)

    def set_game_state_sender(self, sender: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        """Wired after the worker exists: the sender lives on its RTVI processor."""
        self._send_game_state = sender

    async def _publish_state(self) -> None:
        if self._send_game_state is not None:
            await self._send_game_state(self.state.to_rtvi())

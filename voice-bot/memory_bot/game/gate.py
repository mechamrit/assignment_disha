"""The phase machine that runs a game.

Two rules shape this file:

* `process_frame` never awaits the network. Pipecat cancels a processor's frame task on an
  interruption, so an HTTP call made inside it would be lost half way. Instead the gate snapshots
  what it needs, flips the phase synchronously, and puts a job on a queue drained by a task that is
  created on `StartFrame` and survives interruptions.
* The API decides the game. The gate never judges an answer; it reports what was heard and copies
  the numbers from the verdict it gets back.

Everything that can stall has a way out: a read-out that never reports finishing, a host cut off
mid-sentence, a player who goes quiet, and an API that stops answering each have a watchdog or a
retry, because a voice game that waits forever is worse than one that moves on.
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
from memory_bot.game.intents import Intent, count_vocab_words, match_intent, vocab_tokens
from memory_bot.game.presenter import present_sequence
from memory_bot.game.state import GameState, PendingAction, Phase, RoundState
from memory_bot.host import phrases
from memory_bot.host.voice import HostVoice

IN_FLIGHT_RETRY_SECONDS = 0.2
IN_FLIGHT_MAX_RETRIES = 5

# A failed request is retried this many times before the round is read again instead.
NETWORK_RETRY_SECONDS = 0.2
NETWORK_MAX_RETRIES = 2

# How long to wait for the player to speak after they cut the host off. If they say nothing, the
# game carries on with whatever it already owed them.
POST_INTERRUPT_WATCHDOG_SECONDS = 3.0

# The host's audio and the frame that says it stopped do not arrive together, so leave a beat
# before reading the next sequence into the tail of a sentence.
BOT_SETTLE_SECONDS = 0.15
BOT_SETTLE_MAX_WAIT_SECONDS = 5.0


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
        host: HostVoice | None = None,
        vocabulary: list[str],
        presentation_watchdog_extra_secs: float = 0.0,
        send_game_state: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._bot_instance_id = bot_instance_id
        self._voice = host
        self._vocabulary = vocabulary
        self._watchdog_extra = presentation_watchdog_extra_secs
        self._send_game_state = send_game_state
        self._end_pipeline: Callable[[], Awaitable[None]] | None = None

        self.state = GameState(session_id=session_id)
        self._jobs: asyncio.Queue[Job] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None
        self._turn_text: list[str] = []
        self._presentation_watchdog: asyncio.Task[None] | None = None
        self._post_interrupt_watchdog: asyncio.Task[None] | None = None

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
            # What happens next is driven by the assistant turn, which also says whether the host
            # was cut off. This frame only records that the audio stopped.
            self.state.bot_speaking = False

        elif isinstance(frame, UserStartedSpeakingFrame):
            if self.state.phase is Phase.AWAITING_ANSWER and self.state.answer_started_at is None:
                self.state.answer_started_at = time.monotonic()

        elif isinstance(frame, InterruptionFrame):
            if self.state.phase is Phase.PRESENTING:
                self.state.presentation.interrupted = True

        elif isinstance(frame, TranscriptionFrame) and frame.text.strip():
            self._turn_text.append(frame.text.strip())

        elif isinstance(frame, LLMContextFrame):
            if getattr(frame, "speculation", False):
                # A guess at what the player is still saying. Acting on it would score a half
                # finished sentence.
                logger.error("dropping a speculative context frame in phase {}", self.state.phase)
                return

            # A finished user turn. Decide synchronously, do the network work on the queue, and
            # swallow the frame: the host speaks from game events, not from the raw turn.
            self._handle_user_turn()
            return

        await self.push_frame(frame, direction)

    # ------------------------------------------------------ aggregator events

    async def on_assistant_turn_stopped(self, message: Any = None) -> None:
        """The host finished a line, or was cut off part way through one."""
        if self.state.phase not in (Phase.INTRO, Phase.REACTING, Phase.ENDING):
            return

        if bool(getattr(message, "interrupted", False)):
            # Whatever the host owed the player still stands, but the player is talking now, so
            # hear them out before acting on it.
            logger.info("the host was interrupted in phase {}", self.state.phase)
            self.state.awaiting_post_interrupt_turn = True
            self._start_post_interrupt_watchdog()
            return

        self._enqueue("RUN_PENDING")

    async def on_user_turn_idle(self) -> None:
        """The player has gone quiet with the answer window open."""
        if self.state.phase is not Phase.AWAITING_ANSWER:
            return
        self._enqueue("NUDGE")

    # ------------------------------------------------- presentation callbacks

    async def on_presentation_started(self, round_id: str) -> None:
        self.state.presentation.started = True
        self.state.presentation.round_id = round_id

    async def on_presentation_finished(self, round_id: str) -> None:
        self._cancel_presentation_watchdog()
        self.state.presentation.finished = True
        self._enqueue("PRESENTED", {"roundId": round_id})

    async def on_presentation_interrupted(self, round_id: str) -> None:
        self._cancel_presentation_watchdog()
        self.state.presentation.interrupted = True
        self._enqueue("INTERRUPTED", {"roundId": round_id})

    # ------------------------------------------------------------- turn logic

    def _handle_user_turn(self) -> None:
        """Classifies the finished turn and queues the call it needs. Never awaits."""
        transcript = " ".join(self._turn_text).strip()
        self._turn_text.clear()

        if not transcript:
            return

        # They answered the interruption themselves, so the watchdog is not needed.
        self.state.awaiting_post_interrupt_turn = False
        self._cancel_post_interrupt_watchdog()

        vocab_words = count_vocab_words(transcript, self._vocabulary)
        intent = match_intent(transcript, vocab_words)
        logger.info("user turn {!r} -> {} in phase {}", transcript, intent, self.state.phase)

        if self.state.phase is Phase.EVALUATING:
            # The answer is locked; anything said now is talk.
            self._enqueue("EVENT", {"type": "CHATTER", "transcript": transcript})
            return

        presenting = self.state.phase is Phase.PRESENTING

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
            if presenting:
                self._read_the_round_again()
            return

        if intent is Intent.HELP:
            self._enqueue("SAY", {"type": "HELP"})
            if presenting:
                self._read_the_round_again()
            return

        if intent is Intent.GIVE_UP and self.state.round:
            self.state.phase = Phase.EVALUATING
            self._enqueue("ANSWER", {"kind": "GIVE_UP", "transcript": transcript})
            return

        if presenting and self.state.round:
            self._handle_turn_over_the_read_out(transcript)
            return

        if intent is Intent.CHATTER:
            self._enqueue("EVENT", {"type": "CHATTER", "transcript": transcript})
            return

        if self.state.round is None:
            return

        self.state.phase = Phase.EVALUATING
        self._enqueue(
            "ANSWER",
            {"kind": "ANSWER", "transcript": transcript, "latencyMs": self._latency_ms()},
        )

    def _handle_turn_over_the_read_out(self, transcript: str) -> None:
        """The player talked over the sequence, which is either an answer or a request to redo it.

        Only a turn that is exactly the sequence counts as an answer: someone who got ahead of the
        read-out has earned the round. Anything else means they missed part of it, so the round is
        read again rather than scored on what they managed to hear.
        """
        assert self.state.round is not None

        if vocab_tokens(transcript, self._vocabulary) == self.state.round.sequence:
            self.state.phase = Phase.EVALUATING
            self._enqueue(
                "ANSWER",
                {
                    "kind": "ANSWER",
                    "transcript": transcript,
                    "latencyMs": self._latency_ms(),
                    "duringPresentation": True,
                },
            )
            return

        self.state.pending_action = PendingAction.REPRESENT
        self._enqueue("REPEAT", {"reason": "INTERRUPTED"})

    def _read_the_round_again(self) -> None:
        """A command cut the read-out short, so the sequence has to be heard from the top."""
        self.state.phase = Phase.REACTING
        self.state.pending_action = PendingAction.REPRESENT

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
        self._cancel_presentation_watchdog()
        self._cancel_post_interrupt_watchdog()
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
                self.state.pending_action = PendingAction.END
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
            await self._wait_for_quiet()
            await self._run_pending_action()

        elif job.kind == "PRESENTED":
            await self._mark_presented(str(job.payload["roundId"]))

        elif job.kind == "PRESENTATION_LOST":
            # The end sentinel never came back. Rather than listen to nothing, assume the player
            # heard it and record that this bot lost track.
            round_id = str(job.payload["roundId"])
            await self._client.record_event(
                self.state.session_id,
                self._bot_instance_id,
                "BOT_ERROR",
                {"roundId": round_id, "reason": "PRESENTATION_WATCHDOG"},
            )
            self.state.presentation.finished = True
            await self._mark_presented(round_id)

        elif job.kind == "INTERRUPTED":
            await self._client.record_event(
                self.state.session_id,
                self._bot_instance_id,
                "INTERRUPTION",
                {"roundId": job.payload.get("roundId")},
            )
            await self._publish_state()

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
            self.state.phase = Phase.ENDING
            self.state.pending_action = PendingAction.END
            await self._publish_state()

        elif job.kind == "NUDGE":
            self.state.idle_nudges += 1
            if self.state.idle_nudges == 1:
                # Spoken straight to the player: a nudge is not a game event, and running the host
                # for it would put a whole model turn in the middle of the answer window.
                await self.push_frame(
                    TTSSpeakFrame(text=phrases.nudge_line(), append_to_context=False),
                    FrameDirection.DOWNSTREAM,
                )
                await self._client.record_event(
                    self.state.session_id, self._bot_instance_id, "NUDGE", {}
                )
            else:
                self.state.phase = Phase.EVALUATING
                await self._submit_answer({"kind": "TIMEOUT", "transcript": ""})

    async def _mark_presented(self, round_id: str) -> None:
        await self._client.mark_presented(self.state.session_id, round_id, self._bot_instance_id)
        self.state.phase = Phase.AWAITING_ANSWER
        self.state.idle_nudges = 0
        await self._publish_state()

    async def _wait_for_quiet(self) -> None:
        """Holds the next read-out until the host has actually stopped speaking."""
        waited = 0.0
        while self.state.bot_speaking and waited < BOT_SETTLE_MAX_WAIT_SECONDS:
            await asyncio.sleep(BOT_SETTLE_SECONDS)
            waited += BOT_SETTLE_SECONDS

        await asyncio.sleep(BOT_SETTLE_SECONDS)

    async def _run_pending_action(self) -> None:
        action, self.state.pending_action = self.state.pending_action, PendingAction.NONE

        if action is PendingAction.PRESENT_NEXT:
            await self._present_next_round()
        elif action is PendingAction.REPRESENT and self.state.round:
            await self._present(self.state.round)
        elif action is PendingAction.END:
            self.state.phase = Phase.ENDED
            await self._publish_state()
            await self._end_the_pipeline()

    async def _present_next_round(self) -> None:
        payload = await self._client.next_round(self.state.session_id, self._bot_instance_id)
        round_state = RoundState.from_api(payload["round"])
        self.state.start_round(round_state)
        await self._present(round_state)

    async def _present(self, round_state: RoundState) -> None:
        self.state.phase = Phase.PRESENTING
        self.state.presentation.reset(round_state.id)
        await self._publish_state()
        presentation = await present_sequence(self, round_state, self._watchdog_extra)
        self._start_presentation_watchdog(round_state.id, presentation.watchdog_seconds)

    async def _repeat_round(self, reason: str, event_type: str | None = None) -> None:
        if not self.state.round:
            return

        payload = await self._client.repeat_round(
            self.state.session_id,
            self.state.round.id,
            self._bot_instance_id,
            reason,  # type: ignore[arg-type]
        )
        self.state.round = RoundState.from_api(payload["round"])
        if event_type is None:
            event_type = "REPEAT_ACK" if reason == "REQUESTED" else "INTERRUPTED"
        await self._say({"type": event_type})
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
        """Retries with the same attempt number, so scoring stays idempotent whatever happens.

        Two failures are worth waiting through: the answer is already being scored, and the request
        did not arrive. Neither may change the attempt, because the key the API deduplicates on is
        built from it. An answer that never gets a verdict costs the player nothing: the round is
        read again instead.
        """
        assert self.state.round is not None

        network_failures = 0

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
            except (SessionEndedError, StaleBotError):
                # The game is over for this bot; saying goodbye is not this method's job.
                raise
            except ApiError as error:
                network_failures += 1
                if network_failures > NETWORK_MAX_RETRIES:
                    break
                logger.warning("the answer did not reach the API ({}), retrying", error)
                await asyncio.sleep(NETWORK_RETRY_SECONDS)

        logger.warning("gave up waiting for a verdict; asking for the round again")
        await self._repeat_round("INTERRUPTED", event_type="LOST_NOTES")
        return None

    # -------------------------------------------------------------- watchdogs

    def _start_presentation_watchdog(self, round_id: str, seconds: float) -> None:
        self._cancel_presentation_watchdog()
        self._presentation_watchdog = asyncio.create_task(
            self._presentation_timeout(round_id, seconds)
        )

    def _cancel_presentation_watchdog(self) -> None:
        if self._presentation_watchdog is not None:
            self._presentation_watchdog.cancel()
            self._presentation_watchdog = None

    async def _presentation_timeout(self, round_id: str, seconds: float) -> None:
        """Opens the answer window anyway if a read-out never reports finishing."""
        await asyncio.sleep(seconds)

        if self.state.phase is not Phase.PRESENTING:
            return
        if self.state.presentation.finished or self.state.presentation.interrupted:
            return

        logger.warning("the read-out of round {} never reported finishing", round_id)
        self._enqueue("PRESENTATION_LOST", {"roundId": round_id})

    def _start_post_interrupt_watchdog(self) -> None:
        self._cancel_post_interrupt_watchdog()
        self._post_interrupt_watchdog = asyncio.create_task(
            self._post_interrupt_timeout(POST_INTERRUPT_WATCHDOG_SECONDS)
        )

    def _cancel_post_interrupt_watchdog(self) -> None:
        if self._post_interrupt_watchdog is not None:
            self._post_interrupt_watchdog.cancel()
            self._post_interrupt_watchdog = None

    async def _post_interrupt_timeout(self, seconds: float) -> None:
        """Carries on if the player cut the host off and then said nothing."""
        await asyncio.sleep(seconds)

        if not self.state.awaiting_post_interrupt_turn:
            return

        logger.info("nothing followed the interruption; carrying on")
        self.state.awaiting_post_interrupt_turn = False
        self._enqueue("RUN_PENDING")

    # ---------------------------------------------------------------- helpers

    def set_voice(self, voice: HostVoice) -> None:
        """Wired after construction when the voice needs the gate to push its frames."""
        self._voice = voice

    def set_end_callback(self, end: Callable[[], Awaitable[None]]) -> None:
        """Wired to the worker, so a finished game closes the call instead of sitting silent."""
        self._end_pipeline = end

    async def _end_the_pipeline(self) -> None:
        if self._end_pipeline is None:
            logger.debug("no pipeline to end; the gate is running on its own")
            return
        await self._end_pipeline()

    async def _say(self, event: dict[str, Any]) -> None:
        if self._voice is None:
            logger.warning("no host voice attached; dropping event {}", event.get("type"))
            return
        await self._voice.say_event(event)

    def request_intent(self, intent: Intent, source: str = "tool") -> None:
        """Queues the same work a spoken command would, without awaiting anything.

        Tools call this, so a model asking to repeat or to end the game takes exactly the path the
        player's own words take: the gate asks the API, and the API decides.
        """
        logger.info("intent {} requested by {}", intent, source)

        if intent is Intent.REPEAT:
            self.state.pending_action = PendingAction.REPRESENT
            self._enqueue("REPEAT", {"reason": "REQUESTED"})
        elif intent is Intent.QUIT:
            self.state.phase = Phase.ENDING
            self._enqueue("QUIT")
        elif intent is Intent.SCORE:
            self._enqueue(
                "SAY",
                {"type": "SCORE", "score": self.state.score, "rounds": self.state.rounds_cleared},
            )

    def set_game_state_sender(self, sender: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
        """Wired after the worker exists: the sender lives on its RTVI processor."""
        self._send_game_state = sender

    async def _publish_state(self) -> None:
        if self._send_game_state is not None:
            await self._send_game_state(self.state.to_rtvi())

"""The phase machine, row by row, against a fake API.

The gate is where a bug would quietly cost a player points, so these tests assert the calls it
makes as much as the phases it moves through: one answer per attempt, the same attempt number on
a retry, and never a score decided locally.
"""

from typing import Any

import pytest
from pipecat.frames.frames import (
    BotStoppedSpeakingFrame,
    Frame,
    LLMContextFrame,
    TranscriptionFrame,
)
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection

from memory_bot.api.errors import InFlightError
from memory_bot.frames import GameControlFrame, PresentationEndFrame, PresentationStartFrame
from memory_bot.game.gate import GameGateProcessor
from memory_bot.game.state import PendingAction, Phase

VOCABULARY = ["apple", "tiger", "piano", "zebra", "guitar", "lemon"]

ROUND_ONE = {
    "id": "round-1",
    "number": 1,
    "sequence": ["apple", "tiger", "piano"],
    "separator": ". ",
    "repeats": 0,
}
ROUND_TWO = {
    "id": "round-2",
    "number": 2,
    "sequence": ["zebra", "guitar", "lemon", "apple"],
    "separator": ". ",
    "repeats": 0,
}


def verdict(
    *,
    correct: bool = True,
    game_over: bool = False,
    next_round: dict[str, Any] | None = None,
    outcome: str = "PASS",
) -> dict[str, Any]:
    return {
        "replayed": False,
        "roundId": ROUND_ONE["id"],
        "roundNumber": 1,
        "correct": correct,
        "outcome": outcome,
        "expected": ROUND_ONE["sequence"],
        "heardTokens": ROUND_ONE["sequence"] if correct else ["apple"],
        "points": {"total": 45 if correct else 0},
        "session": {
            "score": 45 if correct else 0,
            "roundsCleared": 1 if correct else 0,
            "strikes": 0 if correct else 1,
            "maxStrikes": 1,
            "status": "COMPLETED" if game_over else "IN_PROGRESS",
            "endReason": "FAILED" if game_over else None,
        },
        "gameOver": game_over,
        "nextRound": next_round,
    }


class FakeApi:
    """Records every call the gate makes and answers with canned payloads."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.rounds = [ROUND_ONE, ROUND_TWO]
        self.next_verdict: dict[str, Any] = verdict(next_round=ROUND_TWO)
        self.in_flight_failures = 0

    async def next_round(self, session_id: str, bot_instance_id: str) -> dict[str, Any]:
        payload = self.rounds[min(len(self.calls_of("next_round")), len(self.rounds) - 1)]
        self.calls.append(("next_round", {"sessionId": session_id}))
        return {"round": payload, "created": True}

    async def mark_presented(self, session_id: str, round_id: str, bot: str) -> dict[str, Any]:
        self.calls.append(("mark_presented", {"roundId": round_id}))
        return {"round": {**ROUND_ONE, "status": "AWAITING_ANSWER"}}

    async def submit_answer(
        self, session_id: str, round_id: str, bot: str, **kwargs: Any
    ) -> dict[str, Any]:
        self.calls.append(("submit_answer", {"roundId": round_id, **kwargs}))
        if self.in_flight_failures > 0:
            self.in_flight_failures -= 1
            raise InFlightError(409, "IN_FLIGHT", "still scoring")
        return self.next_verdict

    async def repeat_round(
        self, session_id: str, round_id: str, bot: str, reason: str
    ) -> dict[str, Any]:
        self.calls.append(("repeat_round", {"roundId": round_id, "reason": reason}))
        return {"round": {**ROUND_ONE, "repeats": 1}}

    async def record_event(
        self, session_id: str, bot: str, event_type: str, payload: dict[str, Any] | None = None
    ) -> None:
        self.calls.append(("record_event", {"type": event_type}))

    async def end_session(
        self, session_id: str, reason: str, bot: str | None = None
    ) -> dict[str, Any]:
        self.calls.append(("end_session", {"reason": reason}))
        return {"status": "COMPLETED"}

    def calls_of(self, name: str) -> list[dict[str, Any]]:
        return [payload for called, payload in self.calls if called == name]


class FakeHost:
    """Captures what the host was asked to say, without any text-to-speech."""

    def __init__(self) -> None:
        self.said: list[dict[str, Any]] = []

    async def say_event(self, event: dict[str, Any]) -> None:
        self.said.append(event)

    def types(self) -> list[str]:
        return [str(event.get("type")) for event in self.said]


class Harness:
    def __init__(self) -> None:
        self.api = FakeApi()
        self.host = FakeHost()
        self.pushed: list[Frame] = []
        self.states: list[dict[str, Any]] = []

        self.gate = GameGateProcessor(
            client=self.api,  # type: ignore[arg-type]
            session_id="session-1",
            bot_instance_id="bot-1",
            host=self.host,  # type: ignore[arg-type]
            vocabulary=VOCABULARY,
            send_game_state=self._capture_state,
        )
        self.gate.push_frame = self._capture_frame  # type: ignore[method-assign]
        self.gate._start_worker()

    async def _capture_frame(
        self, frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM
    ) -> None:
        self.pushed.append(frame)

    async def _capture_state(self, state: dict[str, Any]) -> None:
        self.states.append(state)

    async def send(self, frame: Frame) -> None:
        await self.gate.process_frame(frame, FrameDirection.DOWNSTREAM)
        await self.settle()

    async def say(self, text: str) -> None:
        """One finished user turn: transcript arrives, then the aggregator closes the turn."""
        await self.gate.process_frame(
            TranscriptionFrame(user_id="u", text=text, timestamp=""), FrameDirection.DOWNSTREAM
        )
        await self.send(LLMContextFrame(context=LLMContext()))

    async def settle(self) -> None:
        await self.gate._jobs.join()

    async def start_game(self) -> None:
        await self.send(GameControlFrame(action="start"))
        await self.send(BotStoppedSpeakingFrame())  # host finished the intro

    async def finish_read_out(self) -> None:
        await self.gate.on_presentation_started(self.gate.state.round.id)  # type: ignore[union-attr]
        await self.gate.on_presentation_finished(self.gate.state.round.id)  # type: ignore[union-attr]
        await self.settle()

    def frames_of(self, frame_type: type[Frame]) -> list[Frame]:
        return [frame for frame in self.pushed if isinstance(frame, frame_type)]


@pytest.fixture
async def harness() -> Harness:
    return Harness()


@pytest.mark.asyncio
async def test_the_game_starts_with_an_intro_then_reads_the_first_round() -> None:
    h = Harness()

    await h.start_game()

    assert "GAME_START" in h.host.types()
    assert h.api.calls_of("next_round"), "the bot asks the API for the round to read"
    assert h.gate.state.phase is Phase.PRESENTING
    assert len(h.frames_of(PresentationStartFrame)) == 1
    assert len(h.frames_of(PresentationEndFrame)) == 1


@pytest.mark.asyncio
async def test_finishing_the_read_out_opens_the_answer_window() -> None:
    h = Harness()
    await h.start_game()

    await h.finish_read_out()

    assert h.api.calls_of("mark_presented"), "the answer clock starts at the API"
    assert h.gate.state.phase is Phase.AWAITING_ANSWER


@pytest.mark.asyncio
async def test_an_answer_is_sent_once_and_scored_by_the_api() -> None:
    h = Harness()
    await h.start_game()
    await h.finish_read_out()

    await h.say("apple tiger piano")

    answers = h.api.calls_of("submit_answer")
    assert len(answers) == 1
    assert answers[0]["kind"] == "ANSWER"
    assert answers[0]["attempt_seq"] == 1
    assert "ROUND_RESULT" in h.host.types()
    assert h.gate.state.score == 45, "the score comes from the verdict, not from the bot"
    assert h.gate.state.pending_action is PendingAction.PRESENT_NEXT


@pytest.mark.asyncio
async def test_a_retry_reuses_the_same_attempt_so_nothing_is_scored_twice() -> None:
    h = Harness()
    h.api.in_flight_failures = 2
    await h.start_game()
    await h.finish_read_out()

    await h.say("apple tiger piano")

    answers = h.api.calls_of("submit_answer")
    assert len(answers) == 3, "two in-flight answers, then the verdict"
    assert {call["attempt_seq"] for call in answers} == {1}


@pytest.mark.asyncio
async def test_asking_to_repeat_reopens_the_read_out_without_answering() -> None:
    h = Harness()
    await h.start_game()
    await h.finish_read_out()

    await h.say("say that again")

    assert h.api.calls_of("repeat_round")[0]["reason"] == "REQUESTED"
    assert not h.api.calls_of("submit_answer")
    assert h.gate.state.pending_action is PendingAction.REPRESENT


@pytest.mark.asyncio
async def test_chatter_is_recorded_and_never_scored() -> None:
    h = Harness()
    await h.start_game()
    await h.finish_read_out()

    await h.say("this is quite hard isn't it")

    assert not h.api.calls_of("submit_answer")
    assert any(call["type"] == "CHATTER" for call in h.api.calls_of("record_event"))


@pytest.mark.asyncio
async def test_talking_while_a_verdict_is_pending_cannot_change_it() -> None:
    h = Harness()
    await h.start_game()
    await h.finish_read_out()
    h.gate.state.phase = Phase.EVALUATING

    await h.say("apple tiger piano")

    assert not h.api.calls_of("submit_answer"), "the answer is locked once it is being scored"


@pytest.mark.asyncio
async def test_giving_up_ends_the_round_without_an_answer_of_its_own() -> None:
    h = Harness()
    h.api.next_verdict = verdict(correct=False, outcome="FAIL", game_over=True)
    await h.start_game()
    await h.finish_read_out()

    await h.say("i give up")

    answers = h.api.calls_of("submit_answer")
    assert len(answers) == 1
    assert answers[0]["kind"] == "GIVE_UP"


@pytest.mark.asyncio
async def test_a_lost_game_says_goodbye_and_queues_the_end() -> None:
    h = Harness()
    h.api.next_verdict = verdict(correct=False, outcome="FAIL", game_over=True)
    await h.start_game()
    await h.finish_read_out()

    await h.say("apple piano tiger")

    assert "GAME_OVER" in h.host.types()
    assert h.gate.state.pending_action is PendingAction.END
    assert h.gate.state.status == "COMPLETED"


@pytest.mark.asyncio
async def test_quitting_ends_the_session_at_the_api() -> None:
    h = Harness()
    await h.start_game()
    await h.finish_read_out()

    await h.say("i want to quit")

    assert h.api.calls_of("end_session")[0]["reason"] == "QUIT"
    assert "QUIT" in h.host.types()


@pytest.mark.asyncio
async def test_the_browser_is_told_the_phase_without_the_words() -> None:
    h = Harness()
    await h.start_game()

    assert h.states, "the browser needs game_state to render anything"
    for state in h.states:
        assert "apple" not in str(state), "a round's words must never reach the browser"

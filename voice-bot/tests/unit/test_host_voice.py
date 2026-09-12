"""How a game event becomes speech, for both hosts."""

from typing import Any

import pytest
from pipecat.frames.frames import Frame, LLMContextFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.host.voice import LlmVoice, ScriptedVoice


class CapturingPusher(FrameProcessor):
    def __init__(self) -> None:
        super().__init__()
        self.pushed: list[Frame] = []

    async def push_frame(
        self, frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM
    ) -> None:
        self.pushed.append(frame)


class RecordingHost:
    def __init__(self) -> None:
        self.said: list[dict[str, Any]] = []

    async def say_event(self, event: dict[str, Any]) -> None:
        self.said.append(event)


@pytest.mark.asyncio
async def test_the_scripted_voice_passes_the_event_to_the_phrase_bank() -> None:
    host = RecordingHost()
    voice = ScriptedVoice(host)  # type: ignore[arg-type]

    await voice.say_event({"type": "GAME_START"})

    assert host.said == [{"type": "GAME_START"}]


@pytest.mark.asyncio
async def test_the_llm_voice_runs_the_model_exactly_once_per_event() -> None:
    context = LLMContext()
    pusher = CapturingPusher()
    voice = LlmVoice(context, pusher)

    await voice.say_event({"type": "ROUND_RESULT", "outcome": "PASS", "points": 45})

    context_frames = [f for f in pusher.pushed if isinstance(f, LLMContextFrame)]
    assert len(context_frames) == 1, "two frames would produce two overlapping spoken replies"


@pytest.mark.asyncio
async def test_the_llm_voice_appends_the_event_as_a_system_message() -> None:
    context = LLMContext()
    voice = LlmVoice(context, CapturingPusher())

    await voice.say_event({"type": "SCORE", "score": 120, "rounds": 4})

    messages = context.get_messages()
    assert len(messages) == 1
    assert messages[0]["role"] == "system"
    assert "[GAME EVENT]" in messages[0]["content"]
    assert "score=120" in messages[0]["content"]


@pytest.mark.asyncio
async def test_an_open_round_never_reaches_the_model() -> None:
    context = LLMContext()
    voice = LlmVoice(context, CapturingPusher())

    await voice.say_event(
        {"type": "ROUND_RESULT", "outcome": "PASS", "points": 45, "expected": ["apple", "tiger"]}
    )

    assert "apple" not in str(context.get_messages())

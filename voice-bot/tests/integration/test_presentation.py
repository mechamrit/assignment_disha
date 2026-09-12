"""Reading a sequence aloud, and knowing when the player has actually heard it."""

import pytest
from pipecat.frames.frames import Frame, InterruptionFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.frames import PresentationEndFrame, PresentationStartFrame
from memory_bot.game.presenter import present_sequence, watchdog_for
from memory_bot.game.state import RoundState
from memory_bot.game.tracker import PresentationTracker

ROUND = RoundState(id="round-1", number=1, sequence=["apple", "tiger", "piano"], separator=". ")


class CapturingProcessor(FrameProcessor):
    """Records what a component pushes downstream."""

    def __init__(self) -> None:
        super().__init__()
        self.pushed: list[Frame] = []

    async def push_frame(self, frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM):
        self.pushed.append(frame)


@pytest.mark.asyncio
async def test_a_sequence_is_queued_as_one_utterance_between_sentinels() -> None:
    processor = CapturingProcessor()

    await present_sequence(processor, ROUND)

    kinds = [type(frame) for frame in processor.pushed]
    assert kinds == [PresentationStartFrame, TTSSpeakFrame, PresentationEndFrame]

    speak = processor.pushed[1]
    assert isinstance(speak, TTSSpeakFrame)
    assert speak.text == "apple. tiger. piano."
    assert speak.append_to_context is False, "round words must never enter the model context"


@pytest.mark.asyncio
async def test_the_sentinels_carry_the_round_they_belong_to() -> None:
    processor = CapturingProcessor()

    await present_sequence(processor, ROUND)

    start, _, end = processor.pushed
    assert isinstance(start, PresentationStartFrame)
    assert isinstance(end, PresentationEndFrame)
    assert start.round_id == end.round_id == "round-1"
    assert start.word_count == 3


def test_the_watchdog_grows_with_the_number_of_words() -> None:
    assert watchdog_for(3) < watchdog_for(8)
    assert watchdog_for(3, extra_seconds=2) == watchdog_for(3) + 2


@pytest.mark.asyncio
async def test_the_tracker_reports_start_then_finish() -> None:
    events: list[tuple[str, str]] = []

    tracker = PresentationTracker(
        on_started=lambda rid: _record(events, "started", rid),
        on_finished=lambda rid: _record(events, "finished", rid),
        on_interrupted=lambda rid: _record(events, "interrupted", rid),
    )
    tracker.push_frame = _swallow  # type: ignore[method-assign]

    await tracker.process_frame(PresentationStartFrame(round_id="r1"), FrameDirection.DOWNSTREAM)
    await tracker.process_frame(PresentationEndFrame(round_id="r1"), FrameDirection.DOWNSTREAM)

    assert events == [("started", "r1"), ("finished", "r1")]


@pytest.mark.asyncio
async def test_an_interruption_before_the_end_sentinel_is_reported() -> None:
    events: list[tuple[str, str]] = []

    tracker = PresentationTracker(
        on_started=lambda rid: _record(events, "started", rid),
        on_finished=lambda rid: _record(events, "finished", rid),
        on_interrupted=lambda rid: _record(events, "interrupted", rid),
    )
    tracker.push_frame = _swallow  # type: ignore[method-assign]

    await tracker.process_frame(PresentationStartFrame(round_id="r1"), FrameDirection.DOWNSTREAM)
    await tracker.process_frame(InterruptionFrame(), FrameDirection.DOWNSTREAM)

    assert events == [("started", "r1"), ("interrupted", "r1")]


@pytest.mark.asyncio
async def test_an_interruption_after_the_read_out_is_not_reported() -> None:
    events: list[tuple[str, str]] = []

    tracker = PresentationTracker(
        on_started=lambda rid: _record(events, "started", rid),
        on_finished=lambda rid: _record(events, "finished", rid),
        on_interrupted=lambda rid: _record(events, "interrupted", rid),
    )
    tracker.push_frame = _swallow  # type: ignore[method-assign]

    await tracker.process_frame(PresentationStartFrame(round_id="r1"), FrameDirection.DOWNSTREAM)
    await tracker.process_frame(PresentationEndFrame(round_id="r1"), FrameDirection.DOWNSTREAM)
    await tracker.process_frame(InterruptionFrame(), FrameDirection.DOWNSTREAM)

    assert ("interrupted", "r1") not in events


async def _record(events: list[tuple[str, str]], name: str, round_id: str) -> None:
    events.append((name, round_id))


async def _swallow(frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM) -> None:
    return None

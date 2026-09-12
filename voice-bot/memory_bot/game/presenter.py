"""Reading a sequence out loud.

Two rules from docs/PLAN.md are enforced here:

* One `TTSSpeakFrame` for the whole sequence, never one per word. Per-word frames would let the bot
  stop speaking between words, which flips the interruption threshold to a single word and lets a
  cough cut the read-out short.
* The words never enter the conversation context (`append_to_context=False`), so no model ever
  sees them and they cannot leak into what the host says.
"""

from dataclasses import dataclass

from pipecat.frames.frames import TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.frames import PresentationEndFrame, PresentationStartFrame
from memory_bot.game.state import RoundState

# The watchdog allows this long per word, plus a fixed margin, before assuming the end sentinel
# was lost.
SECONDS_PER_WORD = 1.2
BASE_WATCHDOG_SECONDS = 2.0


@dataclass
class Presentation:
    """What was queued, and how long the caller should wait for it."""

    round_id: str
    word_count: int
    watchdog_seconds: float


async def present_sequence(
    processor: FrameProcessor,
    round_state: RoundState,
    extra_watchdog_seconds: float = 0.0,
) -> Presentation:
    """Queues the sentinels and the sequence, and returns the watchdog budget for the read-out."""
    await processor.push_frame(
        PresentationStartFrame(
            round_id=round_state.id,
            round_number=round_state.number,
            word_count=len(round_state.sequence),
        ),
        FrameDirection.DOWNSTREAM,
    )

    await processor.push_frame(
        TTSSpeakFrame(text=round_state.spoken(), append_to_context=False),
        FrameDirection.DOWNSTREAM,
    )

    await processor.push_frame(
        PresentationEndFrame(round_id=round_state.id, round_number=round_state.number),
        FrameDirection.DOWNSTREAM,
    )

    return Presentation(
        round_id=round_state.id,
        word_count=len(round_state.sequence),
        watchdog_seconds=watchdog_for(len(round_state.sequence), extra_watchdog_seconds),
    )


def watchdog_for(word_count: int, extra_seconds: float = 0.0) -> float:
    """How long a read-out of `word_count` words may take before the bot stops waiting."""
    return BASE_WATCHDOG_SECONDS + SECONDS_PER_WORD * word_count + extra_seconds

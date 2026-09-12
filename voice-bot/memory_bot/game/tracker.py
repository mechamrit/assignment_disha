"""Turns the presentation sentinels into "the player has heard it" callbacks.

This processor sits after `transport.output()`, which writes audio before forwarding any non-audio
frame. So when `PresentationEndFrame` reaches here, the words have actually been played, not just
queued. An `InterruptionFrame` clears the queues, so an end frame that never arrives is how a cut
off read-out is detected.
"""

from collections.abc import Awaitable, Callable

from loguru import logger
from pipecat.frames.frames import Frame, InterruptionFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.frames import PresentationEndFrame, PresentationStartFrame

Callback = Callable[[str], Awaitable[None]]


class PresentationTracker(FrameProcessor):
    """Calls back when a read-out starts, finishes, or is interrupted."""

    def __init__(
        self,
        on_started: Callback,
        on_finished: Callback,
        on_interrupted: Callback,
    ) -> None:
        super().__init__()
        self._on_started = on_started
        self._on_finished = on_finished
        self._on_interrupted = on_interrupted
        self._active_round_id: str | None = None

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, PresentationStartFrame):
            self._active_round_id = frame.round_id
            logger.debug("read-out started for round {}", frame.round_id)
            await self._on_started(frame.round_id)

        elif isinstance(frame, PresentationEndFrame):
            finished_round_id = frame.round_id
            self._active_round_id = None
            logger.debug("read-out finished for round {}", finished_round_id)
            await self._on_finished(finished_round_id)

        elif isinstance(frame, InterruptionFrame) and self._active_round_id is not None:
            interrupted_round_id = self._active_round_id
            self._active_round_id = None
            logger.info("read-out interrupted for round {}", interrupted_round_id)
            await self._on_interrupted(interrupted_round_id)

        await self.push_frame(frame, direction)

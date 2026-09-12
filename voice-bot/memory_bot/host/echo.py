"""The M4 host: it repeats what it heard.

This is scaffolding for the pipeline, not the game host. It proves the wiring end to end (audio in,
transcription, turn taking, audio out) without an LLM key, and it is replaced by the scripted and
LLM hosts once the game loop exists.
"""

from loguru import logger
from pipecat.frames.frames import Frame, LLMContextFrame, TranscriptionFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


class EchoHost(FrameProcessor):
    """Speaks back the player's last finished sentence."""

    def __init__(self, prefix: str = "You said") -> None:
        super().__init__()
        self._prefix = prefix
        self._heard: list[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            self._heard.append(frame.text.strip())

        if isinstance(frame, LLMContextFrame):
            # The user aggregator has decided the turn is over, so answer and swallow the frame:
            # there is no LLM in this pipeline to run it through.
            spoken = " ".join(self._heard).strip()
            self._heard.clear()
            logger.info("echo host: user turn finished with {!r}", spoken)

            if spoken:
                await self.push_frame(
                    TTSSpeakFrame(text=f"{self._prefix}: {spoken}", append_to_context=False),
                    FrameDirection.DOWNSTREAM,
                )
            return

        await self.push_frame(frame, direction)

"""Pipeline assembly, with stub services so no API key or network is needed.

This is the test that catches a Pipecat API drift: if the aggregator accessors, the worker
parameters, or the frame order change, the build fails here rather than in a live call.
"""

from unittest.mock import MagicMock

from pipecat.audio.turn.base_turn_analyzer import BaseTurnAnalyzer
from pipecat.processors.frame_processor import FrameProcessor

from memory_bot.config import BotSettings
from memory_bot.pipeline.builder import build_pipeline


class StubTransport:
    """Minimal stand-in for a transport: the pipeline only needs input() and output()."""

    def __init__(self) -> None:
        self._input = FrameProcessor(name="stub-input")
        self._output = FrameProcessor(name="stub-output")

    def input(self) -> FrameProcessor:
        return self._input

    def output(self) -> FrameProcessor:
        return self._output


def build() -> object:
    return build_pipeline(
        transport=StubTransport(),  # type: ignore[arg-type]
        settings=BotSettings(_env_file=None),
        keyterms=["apple", "tiger"],
        conversation_id="session-1",
        idle_timeout_secs=300,
        turn_analyzer_factory=lambda: MagicMock(spec=BaseTurnAnalyzer),
        stt=FrameProcessor(name="stub-stt"),
        tts=FrameProcessor(name="stub-tts"),
    )


def test_the_pipeline_assembles_without_credentials() -> None:
    built = build()

    assert built.worker is not None
    assert built.context is not None
    assert built.host is not None


def test_rtvi_is_available_for_the_client_ready_handshake() -> None:
    built = build()

    assert built.worker.rtvi is not None, "the browser needs RTVI to know the bot is ready"

"""Pipeline assembly.

Frame order matters and is the same one docs/PLAN.md specifies:

    transport.input() -> stt -> user aggregator -> host -> tts -> transport.output() -> assistant

The RTVI observer is told not to forward bot text to the browser: the words of a round travel to
the speaker only, never to the screen, or the game would be trivial to cheat.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.transports.base_transport import BaseTransport

from memory_bot.config import BotSettings
from memory_bot.host.echo import EchoHost
from memory_bot.pipeline.services import build_stt, build_tts
from memory_bot.pipeline.turns import TurnAnalyzerFactory, build_user_aggregator_params


@dataclass
class BuiltPipeline:
    """The worker plus the pieces a caller may still need to reach."""

    worker: PipelineWorker
    context: LLMContext
    host: FrameProcessor


def build_pipeline(
    *,
    transport: BaseTransport,
    settings: BotSettings,
    keyterms: Sequence[str] = (),
    conversation_id: str | None = None,
    idle_timeout_secs: float | None = None,
    turn_analyzer_factory: TurnAnalyzerFactory = LocalSmartTurnAnalyzerV3,
    stt: FrameProcessor | None = None,
    tts: FrameProcessor | None = None,
    host: FrameProcessor | None = None,
) -> BuiltPipeline:
    """Builds the worker. `stt`, `tts`, and `host` are injectable so tests need no API keys."""
    speech_to_text = stt if stt is not None else build_stt(settings, keyterms)
    text_to_speech = tts if tts is not None else build_tts(settings)
    host_processor = host if host is not None else EchoHost()

    context = LLMContext()
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=build_user_aggregator_params(settings, turn_analyzer_factory),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            speech_to_text,
            aggregators.user(),
            host_processor,
            text_to_speech,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True),
        idle_timeout_secs=idle_timeout_secs,
        conversation_id=conversation_id,
        rtvi_observer_params=RTVIObserverParams(
            bot_output_enabled=False,
            bot_tts_enabled=False,
            bot_llm_enabled=False,
        ),
    )

    return BuiltPipeline(worker=worker, context=context, host=host_processor)

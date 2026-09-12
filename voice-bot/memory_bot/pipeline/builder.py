"""Pipeline assembly.

Frame order matters and is the one docs/PLAN.md specifies:

    transport.input() -> stt -> user aggregator -> gate -> host -> tts -> transport.output()
        -> presentation tracker -> assistant aggregator

The tracker sits after `transport.output()` on purpose: the output transport writes audio before it
forwards any other frame, so a sentinel arriving there means the player has actually heard the
words, not merely that they were queued.

The host is either the scripted phrase bank or a model. Either way the gate reports game events
and the host only voices them, so the model never decides an outcome. The RTVI observer is told
not to forward bot text to the browser: a round's words travel to the speaker only.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.transports.base_transport import BaseTransport

from memory_bot.api.client import GameApiClient
from memory_bot.config import BotSettings
from memory_bot.game.gate import GameGateProcessor
from memory_bot.game.tracker import PresentationTracker
from memory_bot.host.echo import EchoHost
from memory_bot.host.llm_factory import build_host, uses_scripted_host
from memory_bot.host.scripted import ScriptedHost
from memory_bot.host.tools import HOST_TOOLS
from memory_bot.host.voice import LlmVoice, ScriptedVoice
from memory_bot.pipeline.services import build_stt, build_tts
from memory_bot.pipeline.turns import TurnAnalyzerFactory, build_user_aggregator_params


@dataclass
class GameWiring:
    """What the gate needs to play a session. Absent means the echo pipeline is built instead."""

    client: GameApiClient
    session_id: str
    bot_instance_id: str
    vocabulary: list[str]


@dataclass
class BuiltPipeline:
    """The worker plus the pieces a caller still needs to reach."""

    worker: PipelineWorker
    context: LLMContext
    host: FrameProcessor
    gate: GameGateProcessor | None = None


def build_pipeline(
    *,
    transport: BaseTransport,
    settings: BotSettings,
    keyterms: Sequence[str] = (),
    conversation_id: str | None = None,
    idle_timeout_secs: float | None = None,
    turn_analyzer_factory: TurnAnalyzerFactory = LocalSmartTurnAnalyzerV3,
    game: GameWiring | None = None,
    stt: FrameProcessor | None = None,
    tts: FrameProcessor | None = None,
    host: FrameProcessor | None = None,
) -> BuiltPipeline:
    """Builds the worker. `stt`, `tts`, and `host` are injectable so tests need no API keys."""
    speech_to_text = stt if stt is not None else build_stt(settings, keyterms)
    text_to_speech = tts if tts is not None else build_tts(settings)

    # Tools belong to the model host only; the scripted host never calls one.
    model_hosted = game is not None and not uses_scripted_host(settings)
    context = LLMContext(tools=HOST_TOOLS) if model_hosted else LLMContext()

    aggregators = LLMContextAggregatorPair(
        context,
        user_params=build_user_aggregator_params(settings, turn_analyzer_factory),
    )
    user_aggregator = aggregators.user()
    assistant_aggregator = aggregators.assistant()

    gate: GameGateProcessor | None = None
    tracker: PresentationTracker | None = None

    if game is not None:
        host_processor: FrameProcessor = host if host is not None else build_host(settings)

        gate = GameGateProcessor(
            client=game.client,
            session_id=game.session_id,
            bot_instance_id=game.bot_instance_id,
            vocabulary=game.vocabulary,
            presentation_watchdog_extra_secs=settings.presentation_watchdog_extra_secs,
        )
        game_gate = gate

        # The two turn signals the gate cannot read off a frame: a player who has gone quiet, and
        # whether the host finished its line or was cut off part way through it.
        @user_aggregator.event_handler("on_user_turn_idle")
        async def _on_user_turn_idle(_aggregator: Any) -> None:
            await game_gate.on_user_turn_idle()

        @assistant_aggregator.event_handler("on_assistant_turn_stopped")
        async def _on_assistant_turn_stopped(_aggregator: Any, message: Any) -> None:
            await game_gate.on_assistant_turn_stopped(message)

        # The scripted host renders events itself; a model needs them as one context message,
        # pushed by the gate, which is why the voice is attached after the gate exists.
        gate.set_voice(
            ScriptedVoice(host_processor)
            if isinstance(host_processor, ScriptedHost)
            else LlmVoice(context, gate)
        )

        tracker = PresentationTracker(
            on_started=gate.on_presentation_started,
            on_finished=gate.on_presentation_finished,
            on_interrupted=gate.on_presentation_interrupted,
        )
    else:
        host_processor = host if host is not None else EchoHost()

    stages: list[FrameProcessor] = [transport.input(), speech_to_text, user_aggregator]
    if gate is not None:
        stages.append(gate)
    stages.extend([host_processor, text_to_speech, transport.output()])
    if tracker is not None:
        stages.append(tracker)
    stages.append(assistant_aggregator)

    worker = PipelineWorker(
        Pipeline(stages),
        params=PipelineParams(enable_metrics=True),
        idle_timeout_secs=idle_timeout_secs,
        conversation_id=conversation_id,
        # Host tools reach the gate through this, so a tool call takes the same path a spoken
        # command does.
        app_resources={"gate": gate} if gate is not None else None,
        rtvi_observer_params=RTVIObserverParams(
            bot_output_enabled=False,
            bot_tts_enabled=False,
            bot_llm_enabled=False,
        ),
    )

    return BuiltPipeline(worker=worker, context=context, host=host_processor, gate=gate)

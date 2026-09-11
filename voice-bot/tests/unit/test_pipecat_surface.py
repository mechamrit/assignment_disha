"""Guards the pinned Pipecat release and the import paths docs/PLAN.md builds on."""

import importlib
from importlib.metadata import version

import pytest

PLAN_IMPORTS = [
    ("pipecat.pipeline.pipeline", "Pipeline"),
    ("pipecat.pipeline.worker", "PipelineWorker"),
    ("pipecat.pipeline.worker", "PipelineParams"),
    ("pipecat.workers.runner", "WorkerRunner"),
    ("pipecat.processors.aggregators.llm_context", "LLMContext"),
    ("pipecat.processors.aggregators.llm_response_universal", "LLMContextAggregatorPair"),
    ("pipecat.processors.aggregators.llm_response_universal", "LLMUserAggregatorParams"),
    ("pipecat.processors.frameworks.rtvi", "RTVIObserverParams"),
    ("pipecat.runner.types", "RunnerArguments"),
    ("pipecat.runner.utils", "create_transport"),
    ("pipecat.transports.base_transport", "TransportParams"),
    ("pipecat.services.deepgram.stt", "DeepgramSTTService"),
    ("pipecat.services.deepgram.tts", "DeepgramTTSService"),
    ("pipecat.audio.vad.silero", "SileroVADAnalyzer"),
    ("pipecat.audio.vad.vad_analyzer", "VADParams"),
    ("pipecat.audio.turn.smart_turn.local_smart_turn_v3", "LocalSmartTurnAnalyzerV3"),
    ("pipecat.turns.user_turn_strategies", "UserTurnStrategies"),
    (
        "pipecat.turns.user_start.min_words_user_turn_start_strategy",
        "MinWordsUserTurnStartStrategy",
    ),
    (
        "pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy",
        "TurnAnalyzerUserTurnStopStrategy",
    ),
]


def test_pipecat_release_is_pinned():
    assert version("pipecat-ai") == "1.9.0"


@pytest.mark.parametrize(("module", "name"), PLAN_IMPORTS)
def test_plan_import_path_resolves(module: str, name: str):
    assert hasattr(importlib.import_module(module), name)

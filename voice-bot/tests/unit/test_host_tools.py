"""Host tools, and the voice each host mode gets.

A tool must never decide anything: it records an intent on the gate, which then asks the API on its
own queue. These tests pin that, and pin that the model is not asked to speak again about the tool
call itself.
"""

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from pipecat.audio.turn.base_turn_analyzer import BaseTurnAnalyzer
from pipecat.processors.frame_processor import FrameProcessor

from memory_bot.config import BotSettings
from memory_bot.host.scripted import ScriptedHost
from memory_bot.host.tools import HOST_TOOLS, end_game, get_score, repeat_sequence
from memory_bot.host.voice import LlmVoice, ScriptedVoice
from memory_bot.pipeline.builder import GameWiring, build_pipeline


class RecordingGate:
    def __init__(self) -> None:
        self.requested: list[str] = []

    def request_intent(self, intent: Any, source: str = "tool") -> None:
        self.requested.append(str(intent))


def params_for(gate: Any) -> Any:
    """A stand-in for FunctionCallParams carrying only what the tools touch."""
    captured: dict[str, Any] = {}

    async def result_callback(result: Any, properties: Any = None) -> None:
        captured["result"] = result
        captured["properties"] = properties

    return SimpleNamespace(app_resources={"gate": gate}, result_callback=result_callback), captured


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "expected_intent"),
    [(repeat_sequence, "REPEAT"), (end_game, "QUIT"), (get_score, "SCORE")],
)
async def test_a_tool_records_an_intent_and_does_not_run_the_model_again(
    tool: Any, expected_intent: str
) -> None:
    gate = RecordingGate()
    params, captured = params_for(gate)

    await tool(params)

    assert gate.requested == [expected_intent]
    assert captured["result"] == {"ok": True}
    assert captured["properties"].run_llm is False


@pytest.mark.asyncio
async def test_a_tool_called_with_no_game_running_reports_it_rather_than_failing() -> None:
    params, captured = params_for(None)

    await repeat_sequence(params)

    assert captured["result"]["ok"] is False
    assert captured["properties"].run_llm is False


def test_every_tool_is_offered_to_the_model() -> None:
    assert set(HOST_TOOLS) == {repeat_sequence, end_game, get_score}


def build(settings: BotSettings, host: FrameProcessor | None = None):
    return build_pipeline(
        transport=SimpleNamespace(  # type: ignore[arg-type]
            input=lambda: FrameProcessor(name="in"),
            output=lambda: FrameProcessor(name="out"),
        ),
        settings=settings,
        game=GameWiring(
            client=MagicMock(),
            session_id="s1",
            bot_instance_id="bot-1",
            vocabulary=["apple"],
        ),
        turn_analyzer_factory=lambda: MagicMock(spec=BaseTurnAnalyzer),
        stt=FrameProcessor(name="stt"),
        tts=FrameProcessor(name="tts"),
        host=host,
    )


def test_without_a_provider_key_the_gate_speaks_through_the_phrase_bank() -> None:
    built = build(BotSettings(_env_file=None, host_mode="llm", google_api_key=""))

    assert isinstance(built.host, ScriptedHost)
    assert isinstance(built.gate._voice, ScriptedVoice)  # noqa: SLF001 - the wiring is the contract


def test_with_a_model_host_the_gate_speaks_by_running_the_model_once() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider="openai", openai_api_key="k"
    )

    built = build(settings, host=FrameProcessor(name="stub-llm"))

    assert isinstance(built.gate._voice, LlmVoice)  # noqa: SLF001 - the wiring is the contract

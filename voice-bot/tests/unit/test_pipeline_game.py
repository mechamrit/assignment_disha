"""Pipeline assembly for a real game, with stub services so no API key is needed."""

from unittest.mock import MagicMock

from pipecat.audio.turn.base_turn_analyzer import BaseTurnAnalyzer
from pipecat.processors.frame_processor import FrameProcessor

from memory_bot.config import BotSettings
from memory_bot.host.echo import EchoHost
from memory_bot.host.scripted import ScriptedHost
from memory_bot.pipeline.builder import GameWiring, build_pipeline


class StubTransport:
    def __init__(self) -> None:
        self._input = FrameProcessor(name="stub-input")
        self._output = FrameProcessor(name="stub-output")

    def input(self) -> FrameProcessor:
        return self._input

    def output(self) -> FrameProcessor:
        return self._output


def build(game: GameWiring | None):
    return build_pipeline(
        transport=StubTransport(),  # type: ignore[arg-type]
        settings=BotSettings(_env_file=None),
        keyterms=["apple"],
        conversation_id="session-1",
        turn_analyzer_factory=lambda: MagicMock(spec=BaseTurnAnalyzer),
        game=game,
        stt=FrameProcessor(name="stub-stt"),
        tts=FrameProcessor(name="stub-tts"),
    )


def wiring() -> GameWiring:
    return GameWiring(
        client=MagicMock(),
        session_id="session-1",
        bot_instance_id="bot-1",
        vocabulary=["apple", "tiger"],
    )


def test_a_game_pipeline_has_the_gate_and_the_scripted_host() -> None:
    built = build(wiring())

    assert built.gate is not None, "a session needs the phase machine in the pipeline"
    assert isinstance(built.host, ScriptedHost)


def test_without_a_session_the_echo_pipeline_is_built_instead() -> None:
    built = build(None)

    assert built.gate is None
    assert isinstance(built.host, EchoHost)


def test_the_game_state_sender_is_attached_after_the_worker_exists() -> None:
    built = build(wiring())
    assert built.gate is not None

    sent: list[dict[str, object]] = []

    async def sender(data: dict[str, object]) -> None:
        sent.append(data)

    built.gate.set_game_state_sender(sender)

    assert built.gate._send_game_state is sender  # noqa: SLF001 - the wiring is the contract here

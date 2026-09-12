"""The turn-taking rules that decide when a player has interrupted or finished."""

from unittest.mock import MagicMock

from pipecat.audio.turn.base_turn_analyzer import BaseTurnAnalyzer
from pipecat.turns.user_start.min_words_user_turn_start_strategy import (
    MinWordsUserTurnStartStrategy,
)
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
    TurnAnalyzerUserTurnStopStrategy,
)

from memory_bot.config import BotSettings
from memory_bot.pipeline.turns import build_user_aggregator_params


def fake_analyzer() -> BaseTurnAnalyzer:
    """Stands in for Smart Turn so the test does not load a model."""
    return MagicMock(spec=BaseTurnAnalyzer)


def test_the_only_start_strategy_counts_words() -> None:
    params = build_user_aggregator_params(BotSettings(_env_file=None), fake_analyzer)

    start = params.user_turn_strategies.start
    assert len(start) == 1, "a VAD start strategy would fire first and make MinWords dead code"
    assert isinstance(start[0], MinWordsUserTurnStartStrategy)


def test_the_stop_strategy_uses_the_turn_analyzer() -> None:
    params = build_user_aggregator_params(BotSettings(_env_file=None), fake_analyzer)

    stop = params.user_turn_strategies.stop
    assert len(stop) == 1
    assert isinstance(stop[0], TurnAnalyzerUserTurnStopStrategy)


def test_timeouts_and_vad_come_from_settings() -> None:
    settings = BotSettings(
        _env_file=None,
        vad_stop_secs=0.5,
        user_turn_stop_timeout_secs=3.5,
        user_idle_timeout_secs=9.0,
    )

    params = build_user_aggregator_params(settings, fake_analyzer)

    assert params.user_turn_stop_timeout == 3.5
    assert params.user_idle_timeout == 9.0
    assert params.vad_analyzer is not None

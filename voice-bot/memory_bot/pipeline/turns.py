"""Turn-taking configuration.

Two rules decide when the player is speaking, and both matter for the game:

* Start: `MinWordsUserTurnStartStrategy(min_words=2)` alone. While the bot is reading a sequence it
  takes two words to interrupt, so a single "hmm" cannot cut the read-out short; when the bot is
  silent one word is enough. No VAD start strategy is added, because it would fire first and make
  the word count dead code.
* Stop: Smart Turn decides the player has finished, so the pauses between remembered words do not
  end the turn early. `user_turn_stop_timeout` is the watchdog when it never fires.
"""

from collections.abc import Callable

from pipecat.audio.turn.base_turn_analyzer import BaseTurnAnalyzer
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.processors.aggregators.llm_response_universal import LLMUserAggregatorParams
from pipecat.turns.user_start.min_words_user_turn_start_strategy import (
    MinWordsUserTurnStartStrategy,
)
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
    TurnAnalyzerUserTurnStopStrategy,
)
from pipecat.turns.user_turn_strategies import UserTurnStrategies

from memory_bot.config import BotSettings

TurnAnalyzerFactory = Callable[[], BaseTurnAnalyzer]


def build_user_aggregator_params(
    settings: BotSettings,
    turn_analyzer_factory: TurnAnalyzerFactory = LocalSmartTurnAnalyzerV3,
) -> LLMUserAggregatorParams:
    """Turn-taking for the user side of the conversation.

    `turn_analyzer_factory` is injectable so tests can avoid loading the Smart Turn model.
    """
    return LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=settings.vad_stop_secs)),
        user_turn_strategies=UserTurnStrategies(
            start=[MinWordsUserTurnStartStrategy(min_words=settings.min_words_to_interrupt)],
            stop=[TurnAnalyzerUserTurnStopStrategy(turn_analyzer=turn_analyzer_factory())],
        ),
        user_turn_stop_timeout=settings.user_turn_stop_timeout_secs,
        user_idle_timeout=settings.user_idle_timeout_secs,
    )

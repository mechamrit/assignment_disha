"""The scripted host.

It turns a game event into a spoken line without any model, so the whole game is playable with no
LLM key. It emits the same frame sequence a language model service would, which keeps the
downstream text-to-speech and the assistant aggregator behaving identically either way.
"""

from typing import Any

from loguru import logger
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.host import phrases
from memory_bot.host.phrases import PhraseBank, spoken_list


class ScriptedHost(FrameProcessor):
    """Speaks from the phrase bank in response to game events pushed by the gate."""

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()
        self._phrases = PhraseBank(seed)

    async def say_event(self, event: dict[str, Any]) -> None:
        """Renders one game event and pushes it downstream as if a model had written it."""
        line = self.render(event)
        if not line:
            return

        logger.info("scripted host: {}", line)
        await self.push_frame(LLMFullResponseStartFrame(), FrameDirection.DOWNSTREAM)
        await self.push_frame(LLMTextFrame(line), FrameDirection.DOWNSTREAM)
        await self.push_frame(LLMFullResponseEndFrame(), FrameDirection.DOWNSTREAM)

    def render(self, event: dict[str, Any]) -> str:
        """Maps a game event to a line. Unknown events produce nothing rather than a guess."""
        event_type = str(event.get("type", ""))

        if event_type == "GAME_START":
            return self._phrases.pick(phrases.INTRO)

        if event_type == "ROUND_RESULT":
            return self._round_result(event)

        if event_type == "REPEAT_ACK":
            return self._phrases.pick(phrases.REPEAT_ACK)

        if event_type == "INTERRUPTED":
            return self._phrases.pick(phrases.INTERRUPTED_ACK)

        if event_type == "NUDGE":
            return self._phrases.pick(phrases.NUDGE)

        if event_type == "SCORE":
            return self._phrases.pick(
                phrases.SCORE, score=event.get("score", 0), rounds=event.get("rounds", 0)
            )

        if event_type == "HELP":
            return self._phrases.pick(phrases.HELP)

        if event_type == "GAME_OVER":
            return self._phrases.pick(
                phrases.GAME_OVER, score=event.get("score", 0), rounds=event.get("rounds", 0)
            )

        if event_type == "QUIT":
            return self._phrases.pick(phrases.QUIT)

        logger.debug("scripted host: nothing to say for {!r}", event_type)
        return ""

    def _round_result(self, event: dict[str, Any]) -> str:
        outcome = str(event.get("outcome", "FAIL"))
        points = int(event.get("points", 0))

        if outcome == "TIMEOUT":
            return self._phrases.pick(phrases.TIMEOUT)

        if outcome == "PASS":
            streak = int(event.get("roundsCleared", 0))
            bank = phrases.CORRECT_STREAK if streak and streak % 3 == 0 else phrases.CORRECT
            return self._phrases.pick(bank, points=points)

        if event.get("gaveUp"):
            return self._phrases.pick(phrases.GIVE_UP)

        # A failed round is the one time the words are said out loud: the game is over for them.
        return self._phrases.pick(
            phrases.WRONG_REVEAL,
            expected=spoken_list(event.get("expected", [])),
            heard=spoken_list(event.get("heard", [])) or "nothing",
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

"""How the host speaks.

The gate reports game events and never formats a sentence itself. Those events reach the player in
one of two ways:

* `ScriptedVoice` renders them from the phrase bank, so the game runs with no model at all.
* `LlmVoice` appends one `[GAME EVENT]` system message to the shared context and pushes exactly
  one context frame, which runs the model exactly once. Pushing twice, or forwarding the player's
  own turn as well, would give two overlapping spoken replies.
"""

from typing import Any, Protocol

from pipecat.frames.frames import LLMContextFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from memory_bot.host.prompt import game_event_message
from memory_bot.host.scripted import ScriptedHost


class HostVoice(Protocol):
    """Anything that can turn a game event into speech."""

    async def say_event(self, event: dict[str, Any]) -> None: ...


class ScriptedVoice:
    """Speaks from the phrase bank."""

    def __init__(self, host: ScriptedHost) -> None:
        self._host = host

    async def say_event(self, event: dict[str, Any]) -> None:
        await self._host.say_event(event)


class LlmVoice:
    """Speaks by running the model once on a game event."""

    def __init__(self, context: LLMContext, pusher: FrameProcessor) -> None:
        self._context = context
        self._pusher = pusher

    async def say_event(self, event: dict[str, Any]) -> None:
        self._context.add_message({"role": "system", "content": game_event_message(event)})
        await self._pusher.push_frame(
            LLMContextFrame(context=self._context), FrameDirection.DOWNSTREAM
        )

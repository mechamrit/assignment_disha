"""Tools the host may call.

A tool never decides anything about the game. Each one records an intent on the gate, which then
does the real work on its own job queue, exactly as if the player had said the words. That keeps
one path for every game action: the gate asks the API, the API decides.

`run_llm=False` on each result stops the model from talking again about the tool call itself; the
line it should say arrives later as a game event.
"""

from typing import Any

from loguru import logger
from pipecat.frames.frames import FunctionCallResultProperties
from pipecat.services.llm_service import FunctionCallParams

from memory_bot.game.intents import Intent


async def repeat_sequence(params: FunctionCallParams) -> None:
    """Read the current list again. Call this only when the player asks to hear it once more."""
    await _request(params, Intent.REPEAT)


async def end_game(params: FunctionCallParams) -> None:
    """End the game. Call this only when the player says they want to stop."""
    await _request(params, Intent.QUIT)


async def get_score(params: FunctionCallParams) -> None:
    """Report the score. Call this only when the player asks how they are doing."""
    await _request(params, Intent.SCORE)


HOST_TOOLS = [repeat_sequence, end_game, get_score]


async def _request(params: FunctionCallParams, intent: Intent) -> None:
    gate = _gate_from(params)

    if gate is None:
        logger.warning("tool {} called with no gate available", intent)
        await params.result_callback(
            {"ok": False, "reason": "the game is not running"},
            properties=FunctionCallResultProperties(run_llm=False),
        )
        return

    gate.request_intent(intent, source="tool")
    await params.result_callback(
        {"ok": True},
        properties=FunctionCallResultProperties(run_llm=False),
    )


def _gate_from(params: FunctionCallParams) -> Any | None:
    resources = params.app_resources
    if isinstance(resources, dict):
        return resources.get("gate")
    return getattr(resources, "gate", None)

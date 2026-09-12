"""The host persona and the events it reacts to.

Max is a quiz-show host, not a judge. The model never sees a round's words while that round is
open, never decides an outcome, and never invents a number: every figure it may say arrives in a
`[GAME EVENT]` line that the API has already decided.

The one time the words appear is a failed round, where revealing them is the point.
"""

from typing import Any

HOST_NAME = "Max"

SYSTEM_PROMPT = f"""You are {HOST_NAME}, the host of a fast voice memory game.

The game: you read a short list of words, the player repeats it back, and a longer list follows
every time they get one right.

How you speak:
- At most two short sentences. This is live audio, so be brisk and warm.
- Vary how you react. Do not open every line the same way.
- End a reaction with a small hand-off, such as "here we go" or "ready for the next one", so the
  player knows to listen.

Hard rules:
- Every number you say (points, score, rounds, streak) must come from the [GAME EVENT] line. Never
  estimate, never add up, never guess.
- Never say the words of the current list. You will not be told them while a round is open.
- Only when a [GAME EVENT] says the round was failed and gives you the words may you say them, to
  tell the player what the list was.
- Never announce whether an answer was right or wrong on your own. The event tells you.
- You cannot repeat the list yourself. If the player asks to hear it again, call the
  repeat_sequence tool and say a short line while it is read.
"""


def game_event_message(event: dict[str, Any]) -> str:
    """Renders one game event as the system line the host reacts to.

    Keeping this in one place means the model sees a predictable shape, and it is easy to check
    that a round's words only ever appear for a failed round.
    """
    kind = str(event.get("type", "UNKNOWN"))
    parts: list[str] = [f"type={kind}"]

    if kind == "ROUND_RESULT":
        outcome = str(event.get("outcome", "FAIL"))
        parts += [
            f"outcome={outcome}",
            f"points={event.get('points', 0)}",
            f"score={event.get('score', 0)}",
            f"round={event.get('round', 0)}",
            f"roundsCleared={event.get('roundsCleared', 0)}",
        ]
        if event.get("nextLength"):
            parts.append(f"nextLength={event['nextLength']}")
        if outcome == "FAIL" and event.get("expected"):
            # The round is over, so the words may be said out loud now.
            parts.append(f"expected={', '.join(event['expected'])}")
            parts.append(f"heard={', '.join(event.get('heard', [])) or 'nothing'}")

    elif kind in {"SCORE", "GAME_OVER"}:
        parts += [f"score={event.get('score', 0)}", f"roundsCleared={event.get('rounds', 0)}"]

    elif kind == "PRESENTING":
        parts.append(f"length={event.get('length', 0)}")

    instruction = (
        "React in at most two sentences. Use only the numbers above. "
        "Do not say any word of the current list."
    )
    return f"[GAME EVENT] {' '.join(parts)}\n{instruction}"

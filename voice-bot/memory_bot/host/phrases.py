"""The scripted host's lines.

Every bank is picked from with a seeded generator that never repeats the previous choice, so a
game sounds varied without an LLM. Lines carry only numbers the API has already decided, and none
of them ever contain a word from a round.
"""

import random
from collections.abc import Sequence

# Placeholders each bank may use are documented per entry; missing keys are left untouched.
INTRO = (
    "Welcome to Memory Card. I read a list, you say it back. Ready?",
    "Here we go. I say some words, you repeat them in order. Listen closely.",
    "Memory Card, round one coming up. Repeat the words in the order I say them.",
)

CORRECT = (
    "Correct. That is {points} points.",
    "Spot on, {points} points.",
    "Exactly right. {points} points for that one.",
)

CORRECT_STREAK = (
    "Three in a row. {points} points.",
    "You are on a run. {points} points.",
)

WRONG_REVEAL = (
    "Not quite. It was {expected}, and I heard {heard}.",
    "Close. The list was {expected}; you said {heard}.",
)

TIMEOUT = (
    "Time is up on that one.",
    "No answer that time.",
)

GIVE_UP = (
    "No problem, we will call that one.",
    "That is alright, it happens.",
)

REPEAT_ACK = (
    "Sure, listen again.",
    "Of course, here it is once more.",
)

INTERRUPTED_ACK = (
    "Let me start that over.",
    "I will read it again from the top.",
)

NUDGE = (
    "Whenever you are ready.",
    "Take your time.",
)

SCORE = (
    "You are on {score} points after {rounds} rounds.",
    "{score} points so far, {rounds} rounds cleared.",
)

HELP = (
    "I read a list of words, you say them back in the same order. Say repeat to hear it again.",
    "Listen to the list, then repeat it in order. Ask me to repeat if you need it again.",
)

GAME_OVER = (
    "That is the game. You finished on {score} points with {rounds} rounds cleared.",
    "Good game. {score} points, {rounds} rounds cleared.",
)

QUIT = (
    "Thanks for playing.",
    "Alright, stopping there. Thanks for playing.",
)


class PhraseBank:
    """Picks lines without repeating the previous one from the same bank."""

    def __init__(self, seed: int | None = None) -> None:
        self._random = random.Random(seed)
        self._last: dict[int, str] = {}

    def pick(self, bank: Sequence[str], **values: object) -> str:
        """Chooses a line from `bank` and fills in any placeholders it uses."""
        if not bank:
            return ""

        choice = self._random.choice(bank)
        if len(bank) > 1:
            previous = self._last.get(id(bank))
            attempts = 0
            while choice == previous and attempts < 5:
                choice = self._random.choice(bank)
                attempts += 1

        self._last[id(bank)] = choice
        return choice.format(**values) if values else choice


def spoken_list(words: Sequence[str]) -> str:
    """Words as the host would say them, used only when a failed round is revealed."""
    return ", ".join(words)

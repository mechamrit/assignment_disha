"""What the player meant, decided by regex before any model sees the words.

The guard matters as much as the patterns: an utterance is only treated as a command when it
carries at most one vocabulary word. "Say that again" is a request to repeat; "apple tiger piano"
is an answer, even though it is three words and none of them are commands.
"""

import re
from collections.abc import Sequence
from enum import StrEnum


class Intent(StrEnum):
    ANSWER = "ANSWER"
    REPEAT = "REPEAT"
    QUIT = "QUIT"
    GIVE_UP = "GIVE_UP"
    SCORE = "SCORE"
    HELP = "HELP"
    CHATTER = "CHATTER"


# Order matters: the first match wins, so "quit" beats "repeat" in "stop repeating".
_PATTERNS: list[tuple[Intent, re.Pattern[str]]] = [
    (Intent.QUIT, re.compile(r"\b(quit|stop the game|end the game|i'?m done)\b")),
    (Intent.GIVE_UP, re.compile(r"\b(give up|pass|skip|i forgot|no idea)\b")),
    (Intent.REPEAT, re.compile(r"\b(repeat|again|say that|one more time)\b")),
    (Intent.SCORE, re.compile(r"\b(score|points)\b")),
    (Intent.HELP, re.compile(r"\b(help|how does|how do i|rules)\b")),
]

# A command may mention at most this many game words before it counts as an answer instead.
MAX_VOCAB_WORDS_FOR_COMMAND = 1


def match_intent(transcript: str, vocab_word_count: int) -> Intent:
    """Classifies one finished user turn.

    `vocab_word_count` is how many words of the game vocabulary the turn contained. Anything above
    the guard is an answer, whatever else it says.
    """
    if vocab_word_count > MAX_VOCAB_WORDS_FOR_COMMAND:
        return Intent.ANSWER

    text = transcript.casefold()
    for intent, pattern in _PATTERNS:
        if pattern.search(text):
            return intent

    return Intent.ANSWER if vocab_word_count > 0 else Intent.CHATTER


def vocab_tokens(transcript: str, vocabulary: Sequence[str]) -> list[str]:
    """The game words in a transcript, in the order they were said.

    Used to tell an answer from an interruption while a sequence is still being read out. It is not
    a judgement: the API compares the tokens it was sent against the round and decides the score.
    """
    if not vocabulary:
        return []

    words = re.findall(r"[a-z]+", transcript.casefold())
    known = {word.casefold() for word in vocabulary}
    return [word for word in words if word in known]


def count_vocab_words(transcript: str, vocabulary: Sequence[str]) -> int:
    """Counts game words in a transcript. The API still decides whether an answer is right."""
    return len(vocab_tokens(transcript, vocabulary))

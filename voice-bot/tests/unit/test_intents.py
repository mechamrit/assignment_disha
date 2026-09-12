"""Intent matching, including the guard that stops an answer being read as a command."""

import pytest

from memory_bot.game.intents import Intent, count_vocab_words, match_intent

VOCAB = ["apple", "tiger", "piano", "zebra", "guitar"]


@pytest.mark.parametrize(
    ("transcript", "expected"),
    [
        ("say that again", Intent.REPEAT),
        ("can you repeat that", Intent.REPEAT),
        ("one more time please", Intent.REPEAT),
        ("i want to quit", Intent.QUIT),
        ("stop the game", Intent.QUIT),
        ("i give up", Intent.GIVE_UP),
        ("pass", Intent.GIVE_UP),
        ("i forgot", Intent.GIVE_UP),
        ("what is my score", Intent.SCORE),
        ("how many points do i have", Intent.SCORE),
        ("help", Intent.HELP),
        ("how does this work", Intent.HELP),
    ],
)
def test_commands_are_recognised_when_no_game_words_are_present(
    transcript: str, expected: Intent
) -> None:
    assert match_intent(transcript, vocab_word_count=0) is expected


def test_a_turn_with_several_game_words_is_always_an_answer() -> None:
    # "repeat" would match the command pattern, but three game words mean this is an answer.
    assert match_intent("apple tiger piano repeat", vocab_word_count=3) is Intent.ANSWER


def test_one_game_word_still_allows_a_command() -> None:
    assert match_intent("say apple again", vocab_word_count=1) is Intent.REPEAT


def test_a_single_game_word_on_its_own_is_an_answer() -> None:
    assert match_intent("apple", vocab_word_count=1) is Intent.ANSWER


def test_words_that_are_neither_command_nor_vocabulary_are_chatter() -> None:
    assert match_intent("this is quite hard isn't it", vocab_word_count=0) is Intent.CHATTER


def test_counting_game_words_ignores_everything_else() -> None:
    assert count_vocab_words("wait, it was apple and tiger", VOCAB) == 2
    assert count_vocab_words("um, hmm", VOCAB) == 0
    assert count_vocab_words("APPLE Tiger", VOCAB) == 2


def test_counting_handles_an_empty_vocabulary() -> None:
    assert count_vocab_words("apple tiger", []) == 0

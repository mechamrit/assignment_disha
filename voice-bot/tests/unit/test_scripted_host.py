"""The scripted host: the game is playable with no LLM key at all."""

from memory_bot.host.phrases import PhraseBank
from memory_bot.host.scripted import ScriptedHost


def host() -> ScriptedHost:
    return ScriptedHost(seed=7)


def test_a_correct_round_mentions_the_points_from_the_verdict() -> None:
    line = host().render({"type": "ROUND_RESULT", "outcome": "PASS", "points": 45})

    assert "45" in line


def test_a_failed_round_reveals_the_words_that_were_expected() -> None:
    line = host().render(
        {
            "type": "ROUND_RESULT",
            "outcome": "FAIL",
            "points": 0,
            "expected": ["apple", "tiger"],
            "heard": ["apple", "piano"],
        }
    )

    assert "apple, tiger" in line
    assert "apple, piano" in line


def test_a_failed_round_with_silence_says_so() -> None:
    line = host().render(
        {"type": "ROUND_RESULT", "outcome": "FAIL", "points": 0, "expected": ["apple"], "heard": []}
    )

    assert "nothing" in line


def test_a_timeout_does_not_reveal_the_words() -> None:
    line = host().render(
        {"type": "ROUND_RESULT", "outcome": "TIMEOUT", "points": 0, "expected": ["apple", "tiger"]}
    )

    assert "apple" not in line


def test_the_score_line_uses_the_running_totals() -> None:
    line = host().render({"type": "SCORE", "score": 120, "rounds": 4})

    assert "120" in line
    assert "4" in line


def test_game_over_reports_the_final_numbers() -> None:
    line = host().render({"type": "GAME_OVER", "score": 90, "rounds": 3})

    assert "90" in line


def test_an_unknown_event_says_nothing_rather_than_inventing_a_line() -> None:
    assert host().render({"type": "SOMETHING_NEW"}) == ""


def test_the_phrase_bank_avoids_repeating_the_previous_line() -> None:
    bank = PhraseBank(seed=3)
    lines = [bank.pick(("one", "two", "three")) for _ in range(10)]

    assert all(lines[i] != lines[i + 1] for i in range(len(lines) - 1))


def test_the_phrase_bank_fills_placeholders() -> None:
    bank = PhraseBank(seed=1)

    assert bank.pick(("{points} points",), points=30) == "30 points"

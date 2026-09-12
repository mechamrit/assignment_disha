"""The host prompt and the game events it reacts to.

The rule under test is the anti-cheat one: a round's words may appear in an event only once that
round has been failed, never while it is open.
"""

from memory_bot.host.prompt import SYSTEM_PROMPT, game_event_message


def test_the_persona_forbids_inventing_numbers_and_saying_the_list() -> None:
    prompt = SYSTEM_PROMPT.lower()

    assert "two short sentences" in prompt
    assert "[game event]" in prompt
    assert "never say the words of the current list" in prompt


def test_a_correct_round_carries_only_numbers() -> None:
    message = game_event_message(
        {
            "type": "ROUND_RESULT",
            "outcome": "PASS",
            "points": 45,
            "score": 45,
            "round": 1,
            "roundsCleared": 1,
            "nextLength": 4,
        }
    )

    assert "outcome=PASS" in message
    assert "points=45" in message
    assert "nextLength=4" in message
    assert "expected=" not in message, "an open game must never hand the words to the model"


def test_a_failed_round_reveals_the_list_because_it_is_over() -> None:
    message = game_event_message(
        {
            "type": "ROUND_RESULT",
            "outcome": "FAIL",
            "points": 0,
            "score": 0,
            "expected": ["apple", "tiger"],
            "heard": ["apple", "piano"],
        }
    )

    assert "expected=apple, tiger" in message
    assert "heard=apple, piano" in message


def test_a_failed_round_with_silence_says_nothing_was_heard() -> None:
    message = game_event_message(
        {"type": "ROUND_RESULT", "outcome": "FAIL", "expected": ["apple"], "heard": []}
    )

    assert "heard=nothing" in message


def test_a_timeout_does_not_reveal_the_list() -> None:
    message = game_event_message(
        {"type": "ROUND_RESULT", "outcome": "TIMEOUT", "expected": ["apple", "tiger"]}
    )

    assert "apple" not in message


def test_the_score_event_carries_the_running_totals() -> None:
    message = game_event_message({"type": "SCORE", "score": 120, "rounds": 4})

    assert "score=120" in message
    assert "roundsCleared=4" in message


def test_every_event_repeats_the_two_sentence_instruction() -> None:
    for event in [{"type": "GAME_START"}, {"type": "NUDGE"}, {"type": "GAME_OVER"}]:
        assert "at most two sentences" in game_event_message(event)


def test_an_unknown_event_still_renders_safely() -> None:
    message = game_event_message({"type": "SOMETHING_NEW"})

    assert "type=SOMETHING_NEW" in message

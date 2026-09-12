"""Game state: what the bot tracks between turns and what it tells the browser."""

from memory_bot.game.state import GameState, Phase, RoundState

ROUND_PAYLOAD = {
    "id": "round-1",
    "number": 3,
    "sequence": ["apple", "tiger", "piano"],
    "separator": ". ",
    "repeats": 1,
}


def test_a_round_is_read_as_one_utterance() -> None:
    round_state = RoundState.from_api(ROUND_PAYLOAD)

    assert round_state.spoken() == "apple. tiger. piano."


def test_the_separator_from_the_api_is_used() -> None:
    round_state = RoundState.from_api({**ROUND_PAYLOAD, "separator": ", "})

    assert round_state.spoken() == "apple, tiger, piano."


def test_starting_a_round_resets_the_attempt_and_the_read_out() -> None:
    state = GameState(session_id="s1")
    state.attempt_seq = 4
    state.idle_nudges = 2

    state.start_round(RoundState.from_api(ROUND_PAYLOAD))

    assert state.attempt_seq == 0
    assert state.idle_nudges == 0
    assert state.presentation.round_id == "round-1"
    assert state.presentation.started is False


def test_attempts_increase_so_every_retry_reuses_one_key() -> None:
    state = GameState(session_id="s1")

    assert state.next_attempt() == 1
    assert state.next_attempt() == 2


def test_a_cut_off_read_out_is_detectable() -> None:
    state = GameState(session_id="s1")
    state.start_round(RoundState.from_api(ROUND_PAYLOAD))
    state.presentation.started = True
    state.presentation.interrupted = True

    assert state.presentation.cut_off is True

    state.presentation.finished = True
    assert state.presentation.cut_off is False


def test_the_verdict_is_copied_rather_than_recomputed() -> None:
    state = GameState(session_id="s1")

    state.apply_verdict(
        {
            "session": {
                "score": 45,
                "roundsCleared": 1,
                "strikes": 0,
                "maxStrikes": 1,
                "status": "IN_PROGRESS",
                "endReason": None,
            }
        }
    )

    assert (state.score, state.rounds_cleared, state.strikes) == (45, 1, 0)
    assert state.status == "IN_PROGRESS"
    assert state.end_reason is None


def test_the_browser_message_never_carries_the_words() -> None:
    state = GameState(session_id="s1")
    state.start_round(RoundState.from_api(ROUND_PAYLOAD))
    state.phase = Phase.PRESENTING

    message = state.to_rtvi()

    assert message["type"] == "game_state"
    assert message["round"] == {"number": 3, "length": 3, "repeats": 1}
    assert "sequence" not in str(message), "a round's words must never reach the browser"

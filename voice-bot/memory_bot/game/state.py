"""The bot's view of the game: which phase it is in and what it owes the player next.

This module is pure. The gate owns the frames and the network; everything here is data, so the
phase table can be tested without a pipeline.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class Phase(StrEnum):
    BOOT = "BOOT"
    INTRO = "INTRO"
    PRESENTING = "PRESENTING"
    AWAITING_ANSWER = "AWAITING_ANSWER"
    EVALUATING = "EVALUATING"
    REACTING = "REACTING"
    ENDING = "ENDING"
    ENDED = "ENDED"


class PendingAction(StrEnum):
    """What to do once the host finishes speaking."""

    NONE = "NONE"
    PRESENT_NEXT = "PRESENT_NEXT"
    REPRESENT = "REPRESENT"
    END = "END"


@dataclass
class PresentationState:
    """Tracks one read-out of a sequence."""

    round_id: str | None = None
    started: bool = False
    finished: bool = False
    interrupted: bool = False

    def reset(self, round_id: str) -> None:
        self.round_id = round_id
        self.started = False
        self.finished = False
        self.interrupted = False

    @property
    def cut_off(self) -> bool:
        """Started, never finished, and an interruption arrived."""
        return self.started and not self.finished and self.interrupted


@dataclass
class RoundState:
    """The round the bot is currently working on, as the API described it."""

    id: str
    number: int
    sequence: list[str]
    separator: str = ". "
    repeats: int = 0

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> "RoundState":
        return cls(
            id=str(payload["id"]),
            number=int(payload["number"]),
            sequence=[str(word) for word in payload.get("sequence", [])],
            separator=str(payload.get("separator", ". ")),
            repeats=int(payload.get("repeats", 0)),
        )

    def spoken(self) -> str:
        """The sequence as one utterance, so the read-out is never interrupted between words."""
        return f"{self.separator.join(self.sequence)}."


@dataclass
class GameState:
    """Everything the gate needs to decide what happens next."""

    session_id: str
    phase: Phase = Phase.BOOT
    round: RoundState | None = None
    attempt_seq: int = 0
    presentation: PresentationState = field(default_factory=PresentationState)
    pending_action: PendingAction = PendingAction.NONE
    answer_started_at: float | None = None
    awaiting_post_interrupt_turn: bool = False
    idle_nudges: int = 0
    bot_speaking: bool = False

    # Numbers the host may mention, kept in step with every verdict.
    score: int = 0
    rounds_cleared: int = 0
    strikes: int = 0
    max_strikes: int = 1
    status: str = "IN_PROGRESS"
    end_reason: str | None = None

    def start_round(self, round_state: RoundState) -> None:
        self.round = round_state
        self.attempt_seq = 0
        self.idle_nudges = 0
        self.answer_started_at = None
        self.presentation.reset(round_state.id)

    def next_attempt(self) -> int:
        self.attempt_seq += 1
        return self.attempt_seq

    def apply_verdict(self, verdict: dict[str, Any]) -> None:
        """Copies the numbers from a verdict; the API is the only place they are decided."""
        session = verdict.get("session", {})
        self.score = int(session.get("score", self.score))
        self.rounds_cleared = int(session.get("roundsCleared", self.rounds_cleared))
        self.strikes = int(session.get("strikes", self.strikes))
        self.max_strikes = int(session.get("maxStrikes", self.max_strikes))
        self.status = str(session.get("status", self.status))
        end_reason = session.get("endReason")
        self.end_reason = str(end_reason) if end_reason else None

    def to_rtvi(self) -> dict[str, Any]:
        """The `game_state` message the browser renders. It never carries the words of a round."""
        return {
            "type": "game_state",
            "phase": self.phase.value,
            "sessionId": self.session_id,
            "round": (
                {
                    "number": self.round.number,
                    "length": len(self.round.sequence),
                    "repeats": self.round.repeats,
                }
                if self.round
                else None
            ),
            "score": self.score,
            "roundsCleared": self.rounds_cleared,
            "strikes": self.strikes,
            "maxStrikes": self.max_strikes,
            "status": self.status,
            "endReason": self.end_reason,
        }

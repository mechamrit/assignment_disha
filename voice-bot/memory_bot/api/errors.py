"""Errors the game API returns, as types the bot can branch on.

The API answers with `{ statusCode, code, message, details? }`, so the bot never has to parse
prose to decide what to do next: retry, stop, or start the round again.
"""

from typing import Any


class ApiError(RuntimeError):
    """Any non-success answer from the game API."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(f"{code} ({status}): {message}")
        self.status = status
        self.code = code
        self.api_message = message
        self.details = details or {}


class InFlightError(ApiError):
    """The same answer is already being scored. Retry shortly with the same idempotency key."""


class SessionEndedError(ApiError):
    """The game is over. Say goodbye and end the pipeline."""


class StaleBotError(ApiError):
    """Another bot instance owns this session now. Stop writing to it."""


class RoundNotOpenError(ApiError):
    """The round has already been scored, so it cannot take another answer."""


_BY_CODE: dict[str, type[ApiError]] = {
    "IN_FLIGHT": InFlightError,
    "SESSION_ENDED": SessionEndedError,
    "STALE_BOT": StaleBotError,
    "ROUND_NOT_OPEN": RoundNotOpenError,
}


def api_error_from(status: int, payload: dict[str, Any]) -> ApiError:
    """Builds the most specific error type for an API response body."""
    code = str(payload.get("code", "HTTP_ERROR"))
    message = str(payload.get("message", "request failed"))
    details = payload.get("details")
    error_type = _BY_CODE.get(code, ApiError)
    return error_type(status, code, message, details if isinstance(details, dict) else None)

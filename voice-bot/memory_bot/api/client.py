"""HTTP client for the game API's internal endpoints.

Every game decision the bot makes is a call through here. Two rules matter:

* The idempotency key for an answer is always `<roundId>:<attemptSeq>`, so a retry of the same
  attempt is scored once, no matter how many times it is sent.
* A 409 is not a failure of the bot: `IN_FLIGHT` means retry the same key, `SESSION_ENDED` and
  `STALE_BOT` mean stop. They come back as types, not as strings to match on.
"""

from types import TracebackType
from typing import Any, Literal, Self

import httpx

from memory_bot.api.errors import ApiError, api_error_from
from memory_bot.config import BotSettings

AnswerKind = Literal["ANSWER", "TIMEOUT", "GIVE_UP"]
RepeatReason = Literal["REQUESTED", "INTERRUPTED"]
EndReason = Literal["QUIT", "DISCONNECTED", "IDLE_TIMEOUT", "CLIENT_END"]

DEFAULT_TIMEOUT_SECONDS = 5.0


class GameApiClient:
    """Thin async client. One instance per bot process, closed when the pipeline finishes."""

    def __init__(
        self,
        settings: BotSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.api_base_url.rstrip("/"),
            headers={"x-internal-token": settings.internal_api_token},
            timeout=timeout,
            transport=transport,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def attach(
        self, session_id: str, client_token: str, bot_instance_id: str
    ) -> dict[str, Any]:
        """Claims the session for this bot and returns the vocabulary, config, and open round."""
        return await self._post(
            f"/internal/sessions/{session_id}/attach",
            {"clientToken": client_token, "botInstanceId": bot_instance_id},
        )

    async def next_round(self, session_id: str, bot_instance_id: str) -> dict[str, Any]:
        return await self._post(
            f"/internal/sessions/{session_id}/rounds/next",
            {"botInstanceId": bot_instance_id},
        )

    async def mark_presented(
        self, session_id: str, round_id: str, bot_instance_id: str
    ) -> dict[str, Any]:
        return await self._post(
            f"/internal/sessions/{session_id}/rounds/{round_id}/presented",
            {"botInstanceId": bot_instance_id},
        )

    async def submit_answer(
        self,
        session_id: str,
        round_id: str,
        bot_instance_id: str,
        *,
        attempt_seq: int,
        kind: AnswerKind,
        transcript: str,
        latency_ms: int | None = None,
        answered_during_presentation: bool = False,
    ) -> dict[str, Any]:
        """Scores one attempt. Retries must reuse the same attempt_seq to stay idempotent."""
        payload: dict[str, Any] = {
            "botInstanceId": bot_instance_id,
            "attemptSeq": attempt_seq,
            "kind": kind,
            "transcript": transcript,
            "answeredDuringPresentation": answered_during_presentation,
        }
        if latency_ms is not None:
            payload["latencyMs"] = latency_ms

        return await self._post(
            f"/internal/sessions/{session_id}/rounds/{round_id}/answer",
            payload,
            headers={"idempotency-key": idempotency_key(round_id, attempt_seq)},
        )

    async def repeat_round(
        self, session_id: str, round_id: str, bot_instance_id: str, reason: RepeatReason
    ) -> dict[str, Any]:
        return await self._post(
            f"/internal/sessions/{session_id}/rounds/{round_id}/repeat",
            {"botInstanceId": bot_instance_id, "reason": reason},
        )

    async def record_event(
        self,
        session_id: str,
        bot_instance_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        await self._post(
            f"/internal/sessions/{session_id}/events",
            {"botInstanceId": bot_instance_id, "type": event_type, "payload": payload or {}},
        )

    async def end_session(
        self, session_id: str, reason: EndReason, bot_instance_id: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"reason": reason}
        if bot_instance_id is not None:
            body["botInstanceId"] = bot_instance_id
        return await self._post(f"/internal/sessions/{session_id}/end", body)

    async def _post(
        self,
        path: str,
        json: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        response = await self._client.post(path, json=json, headers=headers)

        if response.status_code >= 400:
            raise api_error_from(response.status_code, _safe_json(response))

        if response.status_code == 204 or not response.content:
            return {}

        body = _safe_json(response)
        if not isinstance(body, dict):
            raise ApiError(response.status_code, "BAD_RESPONSE", "expected a JSON object")
        return body


def idempotency_key(round_id: str, attempt_seq: int) -> str:
    """The key the API derives too, so a mismatch is a bug rather than a silent second score."""
    return f"{round_id}:{attempt_seq}"


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {"code": "BAD_RESPONSE", "message": response.text[:200]}

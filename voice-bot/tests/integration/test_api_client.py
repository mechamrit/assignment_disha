"""The API client, against a stub transport.

These cover the parts the bot depends on for correctness: the idempotency key it sends, and the
way a 409 becomes a type the phase machine can branch on.
"""

import json
from typing import Any

import httpx
import pytest

from memory_bot.api.client import GameApiClient, idempotency_key
from memory_bot.api.errors import (
    ApiError,
    InFlightError,
    SessionEndedError,
    StaleBotError,
)
from memory_bot.config import BotSettings


def client_with(handler) -> GameApiClient:
    settings = BotSettings(_env_file=None, api_base_url="http://api.test", internal_api_token="tok")
    return GameApiClient(settings, transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_attach_sends_the_internal_token_and_returns_the_body() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["token"] = request.headers.get("x-internal-token")
        seen["json"] = json.loads(request.content)
        return httpx.Response(
            200, json={"session": {"id": "s1"}, "vocabulary": {"keyterms": ["apple"]}}
        )

    async with client_with(handler) as client:
        result = await client.attach("s1", "client-token", "bot-1")

    assert seen["url"] == "http://api.test/internal/sessions/s1/attach"
    assert seen["token"] == "tok"
    assert seen["json"] == {"clientToken": "client-token", "botInstanceId": "bot-1"}
    assert result["vocabulary"]["keyterms"] == ["apple"]


@pytest.mark.asyncio
async def test_an_answer_carries_the_derived_idempotency_key() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers.get("idempotency-key")
        seen["json"] = json.loads(request.content)
        return httpx.Response(200, json={"replayed": False, "correct": True})

    async with client_with(handler) as client:
        await client.submit_answer(
            "s1",
            "r9",
            "bot-1",
            attempt_seq=2,
            kind="ANSWER",
            transcript="apple tiger",
            latency_ms=1200,
        )

    assert seen["key"] == idempotency_key("r9", 2) == "r9:2"
    assert seen["json"]["attemptSeq"] == 2
    assert seen["json"]["kind"] == "ANSWER"
    assert seen["json"]["latencyMs"] == 1200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("IN_FLIGHT", InFlightError),
        ("SESSION_ENDED", SessionEndedError),
        ("STALE_BOT", StaleBotError),
    ],
)
async def test_a_conflict_becomes_a_typed_error(code: str, expected: type[ApiError]) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"statusCode": 409, "code": code, "message": "nope"})

    async with client_with(handler) as client:
        with pytest.raises(expected) as raised:
            await client.next_round("s1", "bot-1")

    assert raised.value.code == code
    assert raised.value.status == 409


@pytest.mark.asyncio
async def test_an_unknown_error_still_arrives_as_an_api_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async with client_with(handler) as client:
        with pytest.raises(ApiError) as raised:
            await client.record_event("s1", "bot-1", "BOT_ERROR")

    assert raised.value.status == 500


@pytest.mark.asyncio
async def test_an_empty_body_is_accepted_for_events() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(202)

    async with client_with(handler) as client:
        await client.record_event("s1", "bot-1", "INTERRUPTION", {"roundId": "r1"})

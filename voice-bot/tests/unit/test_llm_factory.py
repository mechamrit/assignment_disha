"""Choosing the host, including the fallback that keeps the game playable with no key."""

import pytest

from memory_bot.config import BotSettings
from memory_bot.host.llm_factory import (
    UnknownProviderError,
    build_host,
    build_llm_service,
    uses_scripted_host,
)
from memory_bot.host.scripted import ScriptedHost


def test_no_provider_key_means_the_scripted_host() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider="gemini", google_api_key=""
    )

    assert uses_scripted_host(settings) is True
    assert isinstance(build_host(settings), ScriptedHost)


def test_scripted_mode_is_honoured_even_with_a_key() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="scripted", llm_provider="openai", openai_api_key="key"
    )

    assert isinstance(build_host(settings), ScriptedHost)


@pytest.mark.parametrize(
    ("provider", "key_field", "expected_type"),
    [
        ("gemini", "google_api_key", "GoogleLLMService"),
        ("groq", "groq_api_key", "GroqLLMService"),
        ("openai", "openai_api_key", "OpenAILLMService"),
    ],
)
def test_each_provider_builds_its_own_service(
    provider: str, key_field: str, expected_type: str
) -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider=provider, **{key_field: "test-key"}
    )

    service = build_llm_service(settings)

    assert type(service).__name__ == expected_type
    assert uses_scripted_host(settings) is False


def test_an_unknown_provider_is_rejected_rather_than_guessed() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider="gemini", google_api_key="k"
    )
    object.__setattr__(settings, "llm_provider", "mystery")

    with pytest.raises(UnknownProviderError):
        build_llm_service(settings)

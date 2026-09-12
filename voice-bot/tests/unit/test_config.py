"""Settings behaviour, especially the fallback that keeps the game playable without an LLM key."""

from memory_bot.config import BotSettings


def test_defaults_match_the_documented_environment() -> None:
    settings = BotSettings(_env_file=None)

    assert settings.api_base_url == "http://localhost:4000"
    assert settings.stt_model == "nova-3-general"
    assert settings.tts_voice == "aura-2-thalia-en"
    assert settings.min_words_to_interrupt == 2
    assert settings.vad_stop_secs == 0.2
    assert settings.user_turn_stop_timeout_secs == 2.0


def test_host_mode_falls_back_to_scripted_without_a_provider_key() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider="gemini", google_api_key=""
    )

    assert settings.effective_host_mode == "scripted"


def test_host_mode_stays_llm_when_the_selected_provider_has_a_key() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="llm", llm_provider="groq", groq_api_key="key-123"
    )

    assert settings.effective_host_mode == "llm"
    assert settings.provider_api_key == "key-123"


def test_scripted_mode_is_never_upgraded() -> None:
    settings = BotSettings(
        _env_file=None, host_mode="scripted", llm_provider="openai", openai_api_key="key-123"
    )

    assert settings.effective_host_mode == "scripted"


def test_each_provider_has_a_default_model() -> None:
    for provider, expected in [
        ("gemini", "gemini-2.5-flash"),
        ("groq", "llama-3.3-70b-versatile"),
        ("openai", "gpt-4o-mini"),
    ]:
        settings = BotSettings(_env_file=None, llm_provider=provider)
        assert settings.effective_llm_model == expected


def test_an_explicit_model_wins() -> None:
    settings = BotSettings(_env_file=None, llm_provider="gemini", llm_model="gemini-3-pro")

    assert settings.effective_llm_model == "gemini-3-pro"


def test_environment_variables_are_read_case_insensitively(monkeypatch) -> None:
    monkeypatch.setenv("DEEPGRAM_API_KEY", "dg-key")
    monkeypatch.setenv("MIN_WORDS_TO_INTERRUPT", "3")

    settings = BotSettings(_env_file=None)

    assert settings.deepgram_api_key == "dg-key"
    assert settings.min_words_to_interrupt == 3

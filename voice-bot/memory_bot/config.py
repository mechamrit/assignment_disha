"""Typed settings for the voice bot, read once from the environment.

Names match voice-bot/.env.example; pydantic-settings is case-insensitive, so `DEEPGRAM_API_KEY`
fills `deepgram_api_key`. Nothing here reaches out to a service: a missing key is reported by the
component that needs it.
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

HostMode = Literal["llm", "scripted"]
LlmProvider = Literal["gemini", "groq", "openai"]

DEFAULT_LLM_MODELS: dict[LlmProvider, str] = {
    "gemini": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
    "openai": "gpt-4o-mini",
}


class BotSettings(BaseSettings):
    """Everything the bot reads from the environment."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # The game API
    api_base_url: str = "http://localhost:4000"
    internal_api_token: str = "change-me"

    # Speech
    deepgram_api_key: str = ""
    stt_model: str = "nova-3-general"
    tts_voice: str = "aura-2-thalia-en"

    # Host persona
    host_mode: HostMode = "llm"
    llm_provider: LlmProvider = "gemini"
    llm_model: str = ""
    google_api_key: str = ""
    groq_api_key: str = ""
    openai_api_key: str = ""

    # Turn taking
    min_words_to_interrupt: int = 2
    vad_stop_secs: float = 0.2
    user_turn_stop_timeout_secs: float = 2.0
    user_idle_timeout_secs: float = 8.0
    pipeline_idle_timeout_secs: float = 300.0
    presentation_watchdog_extra_secs: float = 2.0

    log_level: str = "INFO"

    @property
    def provider_api_key(self) -> str:
        """The key for the selected LLM provider, empty when it was never set."""
        return {
            "gemini": self.google_api_key,
            "groq": self.groq_api_key,
            "openai": self.openai_api_key,
        }.get(self.llm_provider, "")

    @property
    def effective_host_mode(self) -> HostMode:
        """Falls back to `scripted` without a provider key, so the game still runs."""
        if self.host_mode == "llm" and not self.provider_api_key:
            return "scripted"
        return self.host_mode

    @property
    def effective_llm_model(self) -> str:
        return self.llm_model or DEFAULT_LLM_MODELS.get(self.llm_provider, "")


@lru_cache(maxsize=1)
def get_settings() -> BotSettings:
    """Cached settings, so every component sees the same values."""
    return BotSettings()

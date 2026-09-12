"""Choosing the host.

`HOST_MODE=llm` gives the persona to a model; `scripted` uses the phrase bank. The choice is made
once here, and the settings already fall back to scripted when the selected provider has no key,
so a missing key degrades the game's voice rather than breaking the game.
"""

from pipecat.processors.frame_processor import FrameProcessor

from memory_bot.config import BotSettings
from memory_bot.host.prompt import SYSTEM_PROMPT
from memory_bot.host.scripted import ScriptedHost

# Short answers, quickly: this is live audio between rounds.
HOST_MAX_TOKENS = 80
HOST_TEMPERATURE = 0.8


class UnknownProviderError(ValueError):
    def __init__(self, provider: str) -> None:
        super().__init__(f"unknown LLM provider {provider!r}")


def build_host(settings: BotSettings) -> FrameProcessor:
    """Returns the processor that speaks for the host, model backed or scripted."""
    if settings.effective_host_mode == "scripted":
        return ScriptedHost()

    return build_llm_service(settings)


def build_llm_service(settings: BotSettings) -> FrameProcessor:
    """Builds the model service for the configured provider."""
    provider = settings.llm_provider
    model = settings.effective_llm_model
    api_key = settings.provider_api_key

    if provider == "gemini":
        from pipecat.services.google.llm import GoogleLLMService

        return GoogleLLMService(api_key=api_key, model=model, system_instruction=SYSTEM_PROMPT)

    if provider == "groq":
        from pipecat.services.groq.llm import GroqLLMService

        return GroqLLMService(api_key=api_key, model=model)

    if provider == "openai":
        from pipecat.services.openai.llm import OpenAILLMService

        return OpenAILLMService(api_key=api_key, model=model)

    raise UnknownProviderError(provider)


def uses_scripted_host(settings: BotSettings) -> bool:
    """True when the game will run without any model call."""
    return settings.effective_host_mode == "scripted"

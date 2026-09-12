"""Speech services.

Keyterm boosting is what makes the game fair: the API sends its vocabulary on attach, and those
words are passed to Deepgram so "xylophone" is not heard as "xylophone-ish". Punctuation stays on
because the normalizer strips it anyway, while smart formatting and numerals stay off so nothing
is rewritten into digits or dates.
"""

from collections.abc import Sequence

from pipecat.services.deepgram.stt import DeepgramSTTService, DeepgramSTTSettings
from pipecat.services.deepgram.tts import DeepgramTTSService

from memory_bot.config import BotSettings

# Deepgram caps keyterm boosting; the API sends about 85 words, which stays well inside it.
MAX_KEYTERMS = 100


class MissingDeepgramKeyError(RuntimeError):
    """Raised when speech is needed but DEEPGRAM_API_KEY is empty."""

    def __init__(self) -> None:
        super().__init__("DEEPGRAM_API_KEY is required for speech-to-text and text-to-speech")


def build_stt(settings: BotSettings, keyterms: Sequence[str] = ()) -> DeepgramSTTService:
    """Speech-to-text, boosted towards the game vocabulary."""
    if not settings.deepgram_api_key:
        raise MissingDeepgramKeyError

    return DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        settings=DeepgramSTTSettings(
            model=settings.stt_model,
            keyterm=list(keyterms)[:MAX_KEYTERMS],
            punctuate=True,
            smart_format=False,
            numerals=False,
            interim_results=True,
        ),
    )


def build_tts(settings: BotSettings) -> DeepgramTTSService:
    """Text-to-speech for the host and for reading sequences aloud."""
    if not settings.deepgram_api_key:
        raise MissingDeepgramKeyError

    return DeepgramTTSService(api_key=settings.deepgram_api_key, voice=settings.tts_voice)

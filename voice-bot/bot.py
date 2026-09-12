"""Voice bot entry point.

The development runner imports this module and calls `bot(runner_args)` for each connection, with
`runner_args.body` carrying the `{sessionId, clientToken}` the browser sent when it connected.

Run it with:

    uv run bot.py -t webrtc
"""

import uuid
from typing import Any

from loguru import logger
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transports.base_transport import TransportParams
from pipecat.workers.runner import WorkerRunner

from memory_bot.api.client import GameApiClient
from memory_bot.api.errors import ApiError
from memory_bot.config import get_settings
from memory_bot.pipeline.builder import build_pipeline

# The browser connects over SmallWebRTC; the same bot works on Daily by adding a "daily" entry.
TRANSPORT_PARAMS = {
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


async def bot(runner_args: RunnerArguments) -> None:
    """One connection: attach to the session, build the pipeline, and run until the call ends."""
    settings = get_settings()
    body: dict[str, Any] = runner_args.body or {}
    session_id = body.get("sessionId")
    client_token = body.get("clientToken")
    bot_instance_id = f"bot-{uuid.uuid4().hex[:12]}"

    logger.info("starting bot instance {} for session {}", bot_instance_id, session_id or "<none>")

    transport = await create_transport(runner_args, TRANSPORT_PARAMS)
    client = GameApiClient(settings)
    keyterms: list[str] = []

    try:
        if session_id and client_token:
            attached = await client.attach(session_id, client_token, bot_instance_id)
            vocabulary = attached.get("vocabulary", {})
            keyterms = list(vocabulary.get("keyterms", []))
            logger.info("attached to session {} with {} keyterms", session_id, len(keyterms))
        else:
            logger.warning("no sessionId or clientToken in the connection body; running unattached")

        built = build_pipeline(
            transport=transport,
            settings=settings,
            keyterms=keyterms,
            conversation_id=session_id,
            idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
        )

        @built.worker.rtvi.event_handler("on_client_ready")
        async def _on_client_ready(rtvi: Any) -> None:
            logger.info("client ready for session {}", session_id or "<none>")
            await rtvi.set_bot_ready()

        runner = WorkerRunner(
            handle_sigint=runner_args.handle_sigint,
            handle_sigterm=runner_args.handle_sigterm,
        )
        await runner.add_workers(built.worker)
        await runner.run()
    except ApiError as error:
        logger.error("game API refused the connection: {}", error)
        raise
    finally:
        await client.aclose()


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()

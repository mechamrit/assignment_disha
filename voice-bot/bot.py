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
from memory_bot.frames import GameControlFrame
from memory_bot.game.state import Phase
from memory_bot.pipeline.builder import GameWiring, build_pipeline

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
    game: GameWiring | None = None
    keyterms: list[str] = []

    try:
        if session_id and client_token:
            attached = await client.attach(session_id, client_token, bot_instance_id)
            keyterms = list(attached.get("vocabulary", {}).get("keyterms", []))
            game = GameWiring(
                client=client,
                session_id=session_id,
                bot_instance_id=bot_instance_id,
                vocabulary=keyterms,
            )
            logger.info("attached to session {} with {} keyterms", session_id, len(keyterms))
        else:
            logger.warning("no sessionId or clientToken in the body; running the echo pipeline")

        built = build_pipeline(
            transport=transport,
            settings=settings,
            keyterms=keyterms,
            conversation_id=session_id,
            idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
            game=game,
        )

        gate = built.gate
        if gate is not None:
            # Both of these live on the worker, which exists only now.
            gate.set_game_state_sender(built.worker.rtvi.send_server_message)

            async def end_the_pipeline() -> None:
                await built.worker.end(reason="the game is over")

            gate.set_end_callback(end_the_pipeline)

        async def end_session_once(reason: str) -> None:
            """Ends the session at the API unless the game has already ended itself."""
            if not session_id or (gate is not None and gate.state.phase is Phase.ENDED):
                return

            try:
                await client.end_session(session_id, reason, bot_instance_id)
            except ApiError as error:
                logger.warning("could not end session as {}: {}", reason, error)

        @built.worker.rtvi.event_handler("on_client_ready")
        async def _on_client_ready(rtvi: Any) -> None:
            logger.info("client ready for session {}", session_id or "<none>")
            await rtvi.set_bot_ready()
            if built.gate is not None:
                await built.worker.queue_frame(GameControlFrame(action="start"))

        @built.worker.rtvi.event_handler("on_client_message")
        async def _on_client_message(rtvi: Any, message: Any) -> None:
            if getattr(message, "type", None) != "end_game":
                return

            logger.info("client asked to end session {}", session_id or "<none>")
            await end_session_once("CLIENT_END")
            await rtvi.send_server_response(message, {"ok": True})
            await built.worker.end(reason="the player ended the game")

        @transport.event_handler("on_client_disconnected")
        async def _on_client_disconnected(*_args: Any) -> None:
            logger.info("client disconnected from session {}", session_id or "<none>")
            await end_session_once("DISCONNECTED")
            await built.worker.cancel(reason="the player disconnected")

        @built.worker.event_handler("on_idle_timeout")
        async def _on_idle_timeout(*_args: Any) -> None:
            # Nobody has said anything for long enough that the call is over in practice. The
            # worker cancels itself once this handler returns, so only the API needs telling.
            logger.info("pipeline went idle for session {}", session_id or "<none>")
            await end_session_once("IDLE_TIMEOUT")

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

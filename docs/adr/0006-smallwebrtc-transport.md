# 0006. SmallWebRTC transport

Status: Accepted

## Context

The browser needs low-latency duplex audio with the bot. A hosted WebRTC service adds an account, API keys, and cost to a local demo.

## Decision

Pipecat SmallWebRTC through the development runner (`bot.py -t webrtc`, `POST /api/offer`). The web client uses `SmallWebRTCTransport` with a public STUN server and passes `{ sessionId, clientToken }` as `requestData`. The bot creates its transport through `create_transport`, so moving to Daily is configuration rather than a rewrite.

## Consequences

- Local runs need no third-party media service.
- ICE needs host networking: on macOS the bot runs natively, and the compose `bot` service uses `network_mode: host`, which works on Linux only.
- Restrictive networks such as VPNs may need a TURN server through `PIPECAT_ICE_SERVERS`.

# 0001. The API owns game truth

Status: Accepted

## Context

Pipecat is Python-only. The game needs persisted sessions, rounds, responses, and scores behind REST APIs, with no double scoring. Voice I/O and game state fail differently: a bot process can crash or reconnect in the middle of a round.

## Decision

The NestJS API is the system of record and the only component that creates rounds, evaluates answers, and changes scores. The Python bot is a client of the API's internal endpoints (`/internal/sessions/...`, guarded by `X-Internal-Token`) and calls them on every turn. The web UI reads the public endpoints and treats `GET /sessions/:id` as truth over RTVI messages.

## Consequences

- A bot crash loses no game state. A re-attach with the same client token replaces `botInstanceId`; calls from the replaced bot get `409 STALE_BOT`.
- Every bot action is an HTTP round trip, so the bot's gate processor runs API calls on its own job queue, outside `process_frame`.
- Two languages share one contract through `contracts/`, generated clients, and a CI drift check.

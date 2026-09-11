# 0005. Idempotency layers for answer submission

Status: Accepted

## Context

The bot retries answer submissions after timeouts and network errors, and interruption handling can race a submission. Each round must accept exactly one response and score it once.

## Decision

The bot sends `Idempotency-Key: <roundId>:<attemptSeq>` and reuses it on every retry. The API applies five layers:

1. Redis `SET mc:idem:{key} "__inflight__" NX EX 60`. A stored verdict is returned with `replayed: true`; an in-flight key returns `409 IN_FLIGHT`.
2. `Response.idempotencyKey` UNIQUE.
3. Round status compare-and-set: `updateMany` where status is `CREATED` or `AWAITING_ANSWER`.
4. `GameSession.version` compare-and-set.
5. `Round.acceptedResponseId` UNIQUE.

After commit the verdict is stored under the key for 3600 seconds. On error the key is released so the retry proceeds.

## Consequences

- A replay returns the identical verdict and never changes the score.
- Losing Redis removes only the fast path; layers 2 to 5 still block a second score.
- Concurrency is tested with 20 parallel submits (exactly one accepted) against in-memory ports and against real Postgres.

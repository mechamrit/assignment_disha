# 0004. PostgreSQL and Prisma for persistence

Status: Accepted

## Context

Scoring correctness depends on transactions, unique constraints, and compare-and-set updates across sessions, rounds, and responses. The data is relational (player, session, round, response), and the leaderboard is a query over sessions.

## Decision

PostgreSQL 16 through Prisma. `submit-answer` runs in a `Serializable` transaction. Uniqueness (`Response.idempotencyKey`, `Round.acceptedResponseId`, `Round(sessionId, number)`) and compare-and-set (`Round.status`, `GameSession.version`) are enforced by the database. Redis 7 is a write-through cache after commit; every read falls back to Postgres.

## Consequences

- The database prevents double scoring even when Redis is empty or down.
- Migrations are versioned in `api/prisma/migrations` and applied with `prisma migrate deploy` in containers.
- Local development needs Postgres and Redis, both provided by `docker compose`.

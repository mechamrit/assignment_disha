# 0002. Deterministic answer validation, no LLM

Status: Accepted

## Context

An LLM judging whether the player repeated the sequence is non-deterministic, hard to test, and can be talked into a verdict. The host persona still benefits from an LLM.

## Decision

Validation is pure TypeScript in `api/src/domain` (`normalizeTranscript`, `compareSequences`, `scoreRound`, `evaluateAnswer`) with no Nest, Prisma, or Redis imports, enforced by ESLint. The LLM only voices the host. It receives a `[GAME EVENT]` system message that carries the verdict and the numbers, and never the words of an open round. `HOST_MODE=scripted` renders the same events from a phrase bank and is selected automatically when the provider key is empty.

## Consequences

- Scoring is unit- and property-testable; identical inputs give identical verdicts.
- Speech recognition errors are handled in normalization (filler removal, bigram merge, plural strip, Levenshtein snap for words of five or more letters, disabled by `STRICT_MATCH`), not by model judgment.
- The game is fully playable without any LLM provider.

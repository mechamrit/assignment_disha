# 0003. MinWords interruption policy

Status: Accepted

## Context

While the bot reads a sequence, a backchannel "hmm" or the bot's own echoed audio must not cut it off, but a deliberate "wait wait" must. Pauses between words in the player's answer must not end the turn early.

## Decision

- Turn start: `MinWordsUserTurnStartStrategy(min_words=2)` as the only start strategy. It needs two words while the bot speaks and one when the bot is silent. A VAD start strategy is not used because it would fire first.
- Turn stop: `TurnAnalyzerUserTurnStopStrategy` with `LocalSmartTurnAnalyzerV3`, Silero VAD `stop_secs=0.2`, and `user_turn_stop_timeout=2.0`.
- One `TTSSpeakFrame` per sequence, so no bot-stopped-speaking gap between words lowers the threshold to one word.

## Consequences

- A single filler word during a read-out is ignored; two words interrupt it.
- An interrupted read-out restarts from the first word through `repeat` with reason `INTERRUPTED`, which halves the round's points. A complete, correct answer spoken during the read-out is still accepted.
- If Smart Turn misjudges listed answers, the fallback is `SpeechTimeoutUserTurnStopStrategy(1.2)`.

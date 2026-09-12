import { compareSequences, type CompareResult } from './compare';
import { normalizeTranscript, type NormalizeOptions } from './normalize';
import { DEFAULT_SCORING, scoreRound, type ScoreBreakdown, type ScoreConfig } from './score';
import type { ResponseKind, RoundOutcome } from './types';

export interface EvaluateInput {
  expected: readonly string[];
  transcript: string;
  kind: ResponseKind;
  repeats: number;
  latencyMs?: number | null;
  roundsClearedBefore: number;
  strict?: boolean;
  normalize?: NormalizeOptions;
  scoring?: ScoreConfig;
}

export interface Verdict {
  correct: boolean;
  outcome: RoundOutcome;
  expected: string[];
  heardRaw: string;
  heardTokens: string[];
  vocabTokens: string[];
  detail: CompareResult;
  points: ScoreBreakdown;
  /** True when the player said nothing from the vocabulary, so this was talk, not an answer. */
  isChatter: boolean;
}

/**
 * The whole verdict for one answer, as pure data. This is the only place a round's outcome is
 * decided; no model output is involved anywhere in the path.
 */
export function evaluateAnswer(input: EvaluateInput): Verdict {
  const normalized = normalizeTranscript(input.transcript, {
    strict: input.strict,
    ...input.normalize,
  });

  const expected = [...input.expected];
  const timedOut = input.kind === 'TIMEOUT';
  const gaveUp = input.kind === 'GIVE_UP';

  const detail = compareSequences(expected, normalized.vocabTokens);
  const correct = !timedOut && !gaveUp && detail.correct;

  const outcome: RoundOutcome = timedOut ? 'TIMEOUT' : correct ? 'PASS' : 'FAIL';

  return {
    correct,
    outcome,
    expected,
    heardRaw: input.transcript,
    heardTokens: normalized.tokens,
    vocabTokens: normalized.vocabTokens,
    detail,
    points: scoreRound(
      {
        length: expected.length,
        repeats: input.repeats,
        latencyMs: input.latencyMs,
        roundsClearedBefore: input.roundsClearedBefore,
        correct,
      },
      input.scoring ?? DEFAULT_SCORING,
    ),
    isChatter: !timedOut && !gaveUp && normalized.vocabTokens.length === 0,
  };
}

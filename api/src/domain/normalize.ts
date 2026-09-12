import { ALL_WORDS, FILLERS } from './vocabulary';

export interface NormalizeOptions {
  /** Words that count. Defaults to the whole game vocabulary. */
  vocabulary?: readonly string[];
  fillers?: ReadonlySet<string>;
  /** STRICT_MATCH: compare exactly what was heard, with no fuzzy snapping. */
  strict?: boolean;
}

export interface NormalizedTranscript {
  raw: string;
  /** Cleaned words in spoken order, fillers removed. */
  tokens: string[];
  /** The subset that maps to the vocabulary, with adjacent repeats collapsed. */
  vocabTokens: string[];
}

/** True when `a` and `b` are the same or one edit apart. Cheaper than a full distance matrix. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [shortWord, longWord] = a.length <= b.length ? [a, b] : [b, a];
  if (longWord.length - shortWord.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shortWord.length && j < longWord.length) {
    if (shortWord[i] === longWord[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    // Same length means a substitution, so advance both; otherwise skip one character of the
    // longer word, which covers an insertion or a deletion.
    if (shortWord.length === longWord.length) {
      i += 1;
    }
    j += 1;
  }
  return edits + (longWord.length - j) + (shortWord.length - i) <= 1;
}

/** Minimum length before fuzzy snapping is allowed: short words are too easy to confuse. */
const MIN_SNAP_LENGTH = 5;

/**
 * Turns a raw speech-to-text transcript into the words the comparer sees.
 *
 * Order matters: punctuation is stripped, adjacent words are merged when the join is a vocabulary
 * word ("water melon"), plurals are folded ("apples"), near misses are snapped when the word is
 * long enough ("telescop"), fillers are dropped, and adjacent repeats collapse ("apple apple").
 */
export function normalizeTranscript(
  raw: string,
  options: NormalizeOptions = {},
): NormalizedTranscript {
  const vocabulary = options.vocabulary ?? ALL_WORDS;
  const fillers = options.fillers ?? FILLERS;
  const strict = options.strict ?? false;
  const vocabSet = new Set(vocabulary);

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/['-]/g, '')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const merged = mergeBigrams(cleaned, vocabSet);

  const resolved = merged.map((token) => {
    if (vocabSet.has(token)) return token;

    const singular = stripPlural(token);
    if (singular && vocabSet.has(singular)) return singular;

    if (!strict && token.length >= MIN_SNAP_LENGTH) {
      const snapped = vocabulary.find(
        (word) => word.length >= MIN_SNAP_LENGTH && withinOneEdit(word, token),
      );
      if (snapped) return snapped;
    }

    return token;
  });

  const tokens = resolved.filter((token) => !fillers.has(token));
  const vocabTokens = collapseAdjacentRepeats(tokens.filter((token) => vocabSet.has(token)));

  return { raw, tokens, vocabTokens };
}

function mergeBigrams(tokens: readonly string[], vocabSet: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const next = tokens[i + 1];
    if (next !== undefined && vocabSet.has(tokens[i] + next)) {
      out.push(tokens[i] + next);
      i += 1;
      continue;
    }
    out.push(tokens[i]);
  }
  return out;
}

function stripPlural(token: string): string | null {
  if (token.endsWith('es') && token.length > 3) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 2) return token.slice(0, -1);
  return null;
}

function collapseAdjacentRepeats(tokens: readonly string[]): string[] {
  return tokens.filter((token, index) => index === 0 || token !== tokens[index - 1]);
}

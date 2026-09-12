/**
 * Word pool the game reads out. Chosen to be phonetically distinct: no numbers, no homophones,
 * no minimal pairs, and no word that speech-to-text tends to split into two common words.
 * The list is also sent to the bot as Deepgram keyterms, so keep it short enough to boost well.
 */

export const EASY_WORDS = [
  'apple',
  'basket',
  'button',
  'camera',
  'candle',
  'carpet',
  'cushion',
  'dolphin',
  'engine',
  'feather',
  'forest',
  'garden',
  'guitar',
  'hammer',
  'helmet',
  'island',
  'jacket',
  'jungle',
  'kitten',
  'ladder',
  'lemon',
  'magnet',
  'mirror',
  'napkin',
  'needle',
  'orange',
  'pencil',
  'pillow',
  'piano',
  'rabbit',
  'river',
  'rocket',
  'saddle',
  'silver',
  'table',
  'ticket',
  'tiger',
  'village',
  'violin',
  'walnut',
  'window',
  'yellow',
  'zebra',
] as const;

export const HARD_WORDS = [
  'accordion',
  'ambulance',
  'butterfly',
  'calculator',
  'calendar',
  'carpenter',
  'dinosaur',
  'elephant',
  'envelope',
  'furniture',
  'gymnasium',
  'harmonica',
  'helicopter',
  'hurricane',
  'invitation',
  'kangaroo',
  'laboratory',
  'lighthouse',
  'microscope',
  'motorcycle',
  'newspaper',
  'octopus',
  'orchestra',
  'parachute',
  'pineapple',
  'quarantine',
  'radiator',
  'refrigerator',
  'satellite',
  'saxophone',
  'skeleton',
  'submarine',
  'telescope',
  'television',
  'thermometer',
  'tornado',
  'trampoline',
  'typewriter',
  'volcano',
  'waterfall',
  'watermelon',
  'xylophone',
] as const;

export type DifficultyBucket = 'EASY' | 'HARD';

export const VOCABULARY: Readonly<Record<DifficultyBucket, readonly string[]>> = Object.freeze({
  EASY: EASY_WORDS,
  HARD: HARD_WORDS,
});

/** Every word in both buckets, used for keyterm boosting and for snapping heard words. */
export const ALL_WORDS: readonly string[] = Object.freeze([...EASY_WORDS, ...HARD_WORDS]);

/**
 * Words a player says around an answer. They are dropped before comparison, so "um apple tiger"
 * and "apple tiger" score the same.
 */
export const FILLERS: ReadonlySet<string> = Object.freeze(
  new Set([
    'um',
    'uh',
    'hmm',
    'erm',
    'like',
    'okay',
    'ok',
    'so',
    'and',
    'then',
    'the',
    'a',
    'yeah',
    'yes',
  ]),
);

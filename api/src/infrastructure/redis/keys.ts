/**
 * Every Redis key this service writes, in one place. All of them start with `mc:` so a developer
 * can see the whole game cache with `redis-cli keys 'mc:*'` and flush it without touching
 * anything else on a shared Redis.
 */

export const KEY_PREFIX = 'mc:';

export const redisKeys = {
  /** Cached SessionView JSON, refreshed after every committed write. */
  session: (sessionId: string) => `${KEY_PREFIX}session:${sessionId}`,
  /** Idempotency slot for one answer attempt: in-flight marker, then the stored verdict. */
  idempotency: (key: string) => `${KEY_PREFIX}idem:${key}`,
  /** Sorted set of best score per player. */
  leaderboardBest: `${KEY_PREFIX}leaderboard:best`,
  /** Hash of player id to display name and achieved-at, alongside the sorted set. */
  leaderboardMeta: `${KEY_PREFIX}leaderboard:meta`,
  /** Set once the leaderboard has been rebuilt from the database. */
  leaderboardReady: `${KEY_PREFIX}leaderboard:ready`,
  /** Most recent finished games, newest first. */
  recentScores: `${KEY_PREFIX}scores:recent`,
  /** Words a player heard recently, so new rounds avoid them. */
  recentWords: (playerId: string) => `${KEY_PREFIX}player:${playerId}:recent_words`,
  /** Vocabulary sent to the bot as speech-to-text keyterms. */
  vocabKeyterms: `${KEY_PREFIX}vocab:keyterms`,
} as const;

/** Keep the recent-scores list at 50 entries (LTRIM 0 49). */
export const RECENT_SCORES_MAX = 50;

/** Keep the last 60 words per player (LTRIM 0 59). */
export const RECENT_WORDS_MAX = 60;

export const RECENT_WORDS_TTL_SECONDS = 24 * 60 * 60;

/** Marker stored while an answer is being scored; a second attempt sees it and backs off. */
export const IN_FLIGHT_MARKER = '__inflight__';

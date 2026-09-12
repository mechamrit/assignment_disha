import { SessionEndedError, SessionNotFoundError, StaleBotError } from '../../domain/errors';
import { isTerminalSession } from '../../domain/session.state';
import type { SessionRecord } from '../ports/records';

/**
 * Checks every bot call shares: the session exists, it is still being played, and the caller is
 * the bot currently attached to it. A replaced bot gets STALE_BOT rather than quietly writing.
 */
export function assertPlayableByBot(
  session: SessionRecord | null,
  sessionId: string,
  botInstanceId: string,
): SessionRecord {
  if (!session) throw new SessionNotFoundError(sessionId);

  if (isTerminalSession(session.status)) {
    throw new SessionEndedError(sessionId, session.status);
  }

  if (session.botInstanceId !== null && session.botInstanceId !== botInstanceId) {
    throw new StaleBotError(sessionId);
  }

  return session;
}

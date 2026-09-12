import { Inject, Injectable } from '@nestjs/common';
import {
  CasConflictError,
  InvalidClientTokenError,
  SessionNotFoundError,
} from '../../domain/errors';
import { isTerminalSession, statusForEndReason } from '../../domain/session.state';
import type { EndReason } from '../../domain/types';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { OnSessionCompleted } from '../leaderboard/on-session-completed';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { ID, type IdPort } from '../ports/id.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { buildSessionView, type SessionView } from '../views/session-view';

export interface EndSessionCommand {
  sessionId: string;
  reason: EndReason;
  /** Set by the public endpoint, which authenticates the player. */
  clientToken?: string;
  /** Set by the bot; a stale bot may still end its own session. */
  botInstanceId?: string;
}

/**
 * Ends a session once. Calling it again returns the same view rather than failing, so the browser
 * and the bot can both ask to end without racing each other.
 */
@Injectable()
export class EndSession {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(ID) private readonly ids: IdPort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
    private readonly onSessionCompleted: OnSessionCompleted,
  ) {}

  async execute(command: EndSessionCommand): Promise<SessionView> {
    const found = await this.repos.sessions.findWithPlayer(command.sessionId);
    if (!found) throw new SessionNotFoundError(command.sessionId);

    const { session, player } = found;

    if (command.clientToken !== undefined) {
      const matches = this.ids.safeEquals(
        session.clientTokenHash,
        this.ids.hashToken(command.clientToken),
      );
      if (!matches) throw new InvalidClientTokenError(command.sessionId);
    }

    if (isTerminalSession(session.status)) {
      return this.viewFor(command.sessionId);
    }

    const now = this.clock.now();
    const updated = await this.repos.sessions.compareAndSet(session.id, session.version, {
      status: statusForEndReason(command.reason),
      endReason: command.reason,
      endedAt: now,
      lastActivityAt: now,
    });

    if (!updated) {
      // Another writer ended it first; report what they wrote.
      const current = await this.repos.sessions.findById(session.id);
      if (current && isTerminalSession(current.status)) return this.viewFor(session.id);
      throw new CasConflictError('session', session.id);
    }

    await this.repos.events.record(session.id, 'SESSION_ENDED', {
      reason: command.reason,
      botInstanceId: command.botInstanceId ?? null,
    });

    // The game is over, so this result belongs on the leaderboard and in the recent list.
    await this.onSessionCompleted.execute(updated, player);

    const rounds = await this.repos.rounds.listForSession(session.id);
    const view = buildSessionView({ session: updated, player, rounds });
    await this.cache.writeSession(session.id, view, this.config.sessionCacheTtlSeconds);
    return view;
  }

  private async viewFor(sessionId: string): Promise<SessionView> {
    const found = await this.repos.sessions.findWithPlayer(sessionId);
    if (!found) throw new SessionNotFoundError(sessionId);

    const rounds = await this.repos.rounds.listForSession(sessionId);
    const view = buildSessionView({ session: found.session, player: found.player, rounds });
    await this.cache.writeSession(sessionId, view, this.config.sessionCacheTtlSeconds);
    return view;
  }
}

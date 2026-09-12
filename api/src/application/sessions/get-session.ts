import { Inject, Injectable } from '@nestjs/common';
import { SessionNotFoundError } from '../../domain/errors';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { CACHE, type CachePort } from '../ports/cache.port';
import type { ResponseRecord } from '../ports/records';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { buildSessionView, type SessionView } from '../views/session-view';

/**
 * Reads a session for the browser. Redis answers when it can; a miss, or a Redis outage, falls
 * through to Postgres and refills the cache.
 */
@Injectable()
export class GetSession {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
  ) {}

  async execute(sessionId: string): Promise<SessionView> {
    const cached = await this.cache.readSession<SessionView>(sessionId);
    if (cached) return cached;

    const view = await this.fromDatabase(sessionId);
    await this.cache.writeSession(sessionId, view, this.config.sessionCacheTtlSeconds);
    return view;
  }

  /** Always reads through to Postgres, for callers that just wrote and need the new truth. */
  async fromDatabase(sessionId: string): Promise<SessionView> {
    const found = await this.repos.sessions.findWithPlayer(sessionId);
    if (!found) throw new SessionNotFoundError(sessionId);

    const rounds = await this.repos.rounds.listForSession(sessionId);

    const acceptedResponses = new Map<string, ResponseRecord>();
    for (const round of rounds) {
      if (!round.acceptedResponseId) continue;
      const response = await this.repos.responses.findById(round.acceptedResponseId);
      if (response) acceptedResponses.set(response.id, response);
    }

    return buildSessionView({
      session: found.session,
      player: found.player,
      rounds,
      acceptedResponses,
    });
  }
}

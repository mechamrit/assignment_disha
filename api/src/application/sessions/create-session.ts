import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../domain/errors';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { CACHE, type CachePort } from '../ports/cache.port';
import { ID, type IdPort } from '../ports/id.port';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { buildSessionView } from '../views/session-view';

export const MIN_PLAYER_NAME = 2;
export const MAX_PLAYER_NAME = 24;

export interface CreateSessionCommand {
  playerName: string;
}

export interface CreateSessionResult {
  sessionId: string;
  /** Shown to the browser once; only its hash is stored. */
  clientToken: string;
  player: { id: string; name: string };
  status: 'CREATED';
  bot: { offerUrl: string };
  config: { maxStrikes: number; maxRounds: number };
}

@Injectable()
export class CreateSession {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(ID) private readonly ids: IdPort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
  ) {}

  async execute(command: CreateSessionCommand): Promise<CreateSessionResult> {
    const playerName = command.playerName.trim();

    if (playerName.length < MIN_PLAYER_NAME || playerName.length > MAX_PLAYER_NAME) {
      throw new ValidationError(
        `playerName must be between ${MIN_PLAYER_NAME} and ${MAX_PLAYER_NAME} characters`,
        { playerName: command.playerName },
      );
    }

    const clientToken = this.ids.clientToken();

    const { session, player } = await this.repos.sessions.create({
      playerName,
      nameKey: playerName.toLowerCase(),
      clientTokenHash: this.ids.hashToken(clientToken),
      maxStrikes: this.config.maxStrikes,
      maxRounds: this.config.maxRounds,
    });

    await this.cache.writeSession(
      session.id,
      buildSessionView({ session, player, rounds: [] }),
      this.config.sessionCacheTtlSeconds,
    );

    return {
      sessionId: session.id,
      clientToken,
      player: { id: player.id, name: player.name },
      status: 'CREATED',
      bot: { offerUrl: `${this.config.botPublicUrl.replace(/\/+$/, '')}/api/offer` },
      config: { maxStrikes: session.maxStrikes, maxRounds: session.maxRounds },
    };
  }
}

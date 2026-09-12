import { Inject, Injectable } from '@nestjs/common';
import {
  CasConflictError,
  InvalidClientTokenError,
  SessionEndedError,
  SessionNotFoundError,
} from '../../domain/errors';
import { isTerminalSession } from '../../domain/session.state';
import { ALL_WORDS, FILLERS } from '../../domain/vocabulary';
import { DEFAULT_LADDER } from '../../domain/ladder';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { ID, type IdPort } from '../ports/id.port';
import type { RoundRecord } from '../ports/records';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';
import { buildSessionView, type SessionView } from '../views/session-view';

export interface AttachBotCommand {
  sessionId: string;
  clientToken: string;
  botInstanceId: string;
}

/** The shape the bot needs to read a round aloud. */
export interface RoundForBot {
  id: string;
  number: number;
  sequence: string[];
  separator: string;
  status: string;
  repeats: number;
}

export interface AttachBotResult {
  session: SessionView;
  vocabulary: { keyterms: string[]; fillers: string[] };
  config: {
    maxStrikes: number;
    maxRounds: number;
    ladder: { baseLength: number; maxLength: number; hardFromRound: number };
    answerIdleSecs: number;
  };
  currentRound: RoundForBot | null;
}

const ANSWER_IDLE_SECONDS = 8;

/**
 * The bot's handshake. It proves it holds the player's client token, becomes the session's only
 * bot, and gets everything it needs for the session: vocabulary for keyterm boosting, the game
 * limits, and the open round if there is one.
 */
@Injectable()
export class AttachBot {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(ID) private readonly ids: IdPort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
  ) {}

  async execute(command: AttachBotCommand): Promise<AttachBotResult> {
    const found = await this.repos.sessions.findWithPlayer(command.sessionId);
    if (!found) throw new SessionNotFoundError(command.sessionId);

    const { session, player } = found;

    if (!this.ids.safeEquals(session.clientTokenHash, this.ids.hashToken(command.clientToken))) {
      throw new InvalidClientTokenError(command.sessionId);
    }

    if (isTerminalSession(session.status)) {
      throw new SessionEndedError(command.sessionId, session.status);
    }

    const now = this.clock.now();
    const updated = await this.repos.sessions.compareAndSet(session.id, session.version, {
      botInstanceId: command.botInstanceId,
      status: session.status === 'CREATED' ? 'IN_PROGRESS' : session.status,
      startedAt: session.startedAt ?? now,
      lastActivityAt: now,
    });

    if (!updated) throw new CasConflictError('session', session.id);

    await this.repos.events.record(session.id, 'BOT_ATTACHED', {
      botInstanceId: command.botInstanceId,
    });

    const rounds = await this.repos.rounds.listForSession(session.id);
    const view = buildSessionView({ session: updated, player, rounds });
    await this.cache.writeSession(session.id, view, this.config.sessionCacheTtlSeconds);

    const openRound = rounds.find((round) => round.status !== 'EVALUATED') ?? null;

    return {
      session: view,
      vocabulary: { keyterms: [...ALL_WORDS], fillers: [...FILLERS] },
      config: {
        maxStrikes: updated.maxStrikes,
        maxRounds: updated.maxRounds,
        ladder: {
          baseLength: DEFAULT_LADDER.baseLength,
          maxLength: DEFAULT_LADDER.maxLength,
          hardFromRound: DEFAULT_LADDER.hardFromRound,
        },
        answerIdleSecs: ANSWER_IDLE_SECONDS,
      },
      currentRound: openRound ? toRoundForBot(openRound) : null,
    };
  }
}

export function toRoundForBot(round: RoundRecord): RoundForBot {
  return {
    id: round.id,
    number: round.number,
    sequence: round.sequence,
    separator: round.separator,
    status: round.status,
    repeats: round.repeats,
  };
}

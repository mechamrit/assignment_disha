import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CasConflictError,
  InFlightError,
  RoundNotFoundError,
  RoundNotOpenError,
  ValidationError,
} from '../../domain/errors';
import { evaluateAnswer } from '../../domain/evaluate';
import { ladderFor } from '../../domain/ladder';
import { OPEN_ROUND_STATUSES } from '../../domain/round.state';
import { endReasonForGameOver, isGameOver, statusForEndReason } from '../../domain/session.state';
import { generateSequence } from '../../domain/sequence';
import type { ResponseKind } from '../../domain/types';
import { GAME_CONFIG, type GameConfig } from '../game-config';
import { OnSessionCompleted } from '../leaderboard/on-session-completed';
import { CACHE, type CachePort } from '../ports/cache.port';
import { CLOCK, type ClockPort } from '../ports/clock.port';
import { IDEMPOTENCY, type IdempotencyPort } from '../ports/idempotency.port';
import type { ResponseRecord, RoundRecord, SessionRecord } from '../ports/records';
import {
  REPOSITORIES,
  UNIT_OF_WORK,
  type RepositoryBundle,
  type UnitOfWork,
} from '../ports/unit-of-work.port';
import { toRoundForBot } from '../sessions/attach-bot';
import { buildSessionView } from '../views/session-view';
import type { VerdictView } from '../views/verdict-view';
import { assertPlayableByBot } from './session-guards';

export type AnswerKind = Extract<ResponseKind, 'ANSWER' | 'TIMEOUT' | 'GIVE_UP'>;

export interface SubmitAnswerCommand {
  sessionId: string;
  roundId: string;
  botInstanceId: string;
  attemptSeq: number;
  kind: AnswerKind;
  transcript: string;
  latencyMs?: number | null;
  /** The player said the whole sequence before the read-out finished. */
  answeredDuringPresentation?: boolean;
  /** `<roundId>:<attemptSeq>`, reused by every retry of the same attempt. */
  idempotencyKey: string;
}

const IN_FLIGHT_TTL_SECONDS = 60;

/**
 * Scores one answer, exactly once.
 *
 * Five layers stand between a retry and a second score, in this order:
 *   1. Redis claims the idempotency key; a stored verdict replays and an in-flight key is told to
 *      retry.
 *   2. Response.idempotencyKey is unique, so a duplicate insert reveals the earlier attempt.
 *   3. The round moves to EVALUATED only while it is still open.
 *   4. The session write is a compare-and-set on `version`.
 *   5. Round.acceptedResponseId is unique, so one round can only ever point at one response.
 * Layers 2 to 5 live in Postgres, so losing Redis costs the fast path and nothing else.
 */
@Injectable()
export class SubmitAnswer {
  private readonly logger = new Logger(SubmitAnswer.name);

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(IDEMPOTENCY) private readonly idempotency: IdempotencyPort,
    @Inject(CACHE) private readonly cache: CachePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(GAME_CONFIG) private readonly config: GameConfig,
    private readonly onSessionCompleted: OnSessionCompleted,
  ) {}

  async execute(command: SubmitAnswerCommand): Promise<VerdictView> {
    const claim = await this.idempotency.begin<VerdictView>(
      command.idempotencyKey,
      IN_FLIGHT_TTL_SECONDS,
    );

    if (claim.state === 'completed') return { ...claim.value, replayed: true };
    if (claim.state === 'in_flight') throw new InFlightError(command.idempotencyKey);

    let verdict: VerdictView;
    try {
      verdict = await this.unitOfWork.run((repos) => this.score(repos, command));
    } catch (error) {
      // Free the slot so the bot's retry with the same key can proceed.
      await this.idempotency.release(command.idempotencyKey);
      throw error;
    }

    await this.afterCommit(command, verdict);
    return verdict;
  }

  private async score(repos: RepositoryBundle, command: SubmitAnswerCommand): Promise<VerdictView> {
    const round = await repos.rounds.findById(command.roundId);
    if (!round || round.sessionId !== command.sessionId) {
      throw new RoundNotFoundError(command.roundId);
    }

    const session = assertPlayableByBot(
      await repos.sessions.findById(command.sessionId),
      command.sessionId,
      command.botInstanceId,
    );

    // Layer 3, read side: an already scored round replays its stored verdict.
    if (round.status === 'EVALUATED') {
      return this.replayFrom(repos, round, session);
    }

    const evaluation = evaluateAnswer({
      expected: round.sequence,
      transcript: command.transcript,
      kind: command.kind,
      repeats: round.repeats,
      latencyMs: command.latencyMs ?? null,
      roundsClearedBefore: session.roundsCleared,
      strict: this.config.strictMatch,
    });

    // Talking is not answering. Recording it keeps the audit trail without ending the game.
    if (command.kind === 'ANSWER' && evaluation.isChatter) {
      await repos.events.record(session.id, 'CHATTER', {
        roundId: round.id,
        transcript: command.transcript,
        botInstanceId: command.botInstanceId,
      });
      throw new ValidationError('Answer contained no vocabulary words', {
        roundId: round.id,
        transcript: command.transcript,
      });
    }

    // Layer 2: the unique idempotency key turns a duplicate insert into a replay.
    const inserted = await repos.responses.createIfAbsent({
      roundId: round.id,
      attemptSeq: command.attemptSeq,
      kind: command.kind,
      transcriptRaw: command.transcript,
      normalizedTokens: evaluation.heardTokens,
      vocabTokens: evaluation.vocabTokens,
      isCorrect: evaluation.correct,
      idempotencyKey: command.idempotencyKey,
      latencyMs: command.latencyMs ?? null,
      botInstanceId: command.botInstanceId,
    });

    if (!inserted.created) {
      const current = await repos.rounds.findById(round.id);
      if (current && current.status === 'EVALUATED') {
        return this.replayFrom(repos, current, session);
      }
      throw new CasConflictError('round', round.id);
    }

    const now = this.clock.now();

    // Layers 3 and 5: the round moves to EVALUATED only from an open state, and points at exactly
    // one accepted response.
    const scoredRound = await repos.rounds.evaluateIfOpen(round.id, OPEN_ROUND_STATUSES, {
      outcome: evaluation.outcome,
      pointsAwarded: evaluation.points.total,
      answeredAt: now,
      latencyMs: command.latencyMs ?? null,
      acceptedResponseId: inserted.response.id,
      presentedAt: round.presentedAt ?? now,
    });

    if (!scoredRound) throw new CasConflictError('round', round.id);

    const roundsCleared = session.roundsCleared + (evaluation.correct ? 1 : 0);
    const strikes = session.strikes + (evaluation.correct ? 0 : 1);
    const gameOver = isGameOver({
      strikes,
      maxStrikes: session.maxStrikes,
      roundsCleared,
      maxRounds: session.maxRounds,
    });
    const endReason = gameOver
      ? endReasonForGameOver({
          strikes,
          maxStrikes: session.maxStrikes,
          roundsCleared,
          maxRounds: session.maxRounds,
        })
      : null;

    // Layer 4: the session write only lands while `version` is unchanged.
    const updatedSession = await repos.sessions.compareAndSet(session.id, session.version, {
      score: session.score + evaluation.points.total,
      roundsCleared,
      strikes,
      status: gameOver && endReason ? statusForEndReason(endReason) : session.status,
      endReason,
      endedAt: gameOver ? now : null,
      lastActivityAt: now,
    });

    if (!updatedSession) throw new CasConflictError('session', session.id);

    const nextRound = gameOver
      ? null
      : await this.createNextRound(repos, updatedSession, scoredRound.number + 1);

    await repos.events.record(session.id, 'ROUND_EVALUATED', {
      roundId: scoredRound.id,
      roundNumber: scoredRound.number,
      outcome: evaluation.outcome,
      points: evaluation.points.total,
      score: updatedSession.score,
      gameOver,
    });

    return {
      replayed: false,
      roundId: scoredRound.id,
      roundNumber: scoredRound.number,
      correct: evaluation.correct,
      outcome: evaluation.outcome,
      expected: evaluation.expected,
      heardRaw: evaluation.heardRaw,
      heardTokens: evaluation.vocabTokens,
      detail: {
        firstErrorIndex: evaluation.detail.firstErrorIndex,
        missing: evaluation.detail.missing,
        extra: evaluation.detail.extra,
      },
      points: evaluation.points,
      session: {
        score: updatedSession.score,
        roundsCleared: updatedSession.roundsCleared,
        strikes: updatedSession.strikes,
        maxStrikes: updatedSession.maxStrikes,
        status: updatedSession.status,
        endReason: updatedSession.endReason,
      },
      gameOver,
      nextRound: nextRound ? toRoundForBot(nextRound) : null,
    };
  }

  private async createNextRound(
    repos: RepositoryBundle,
    session: SessionRecord,
    number: number,
  ): Promise<RoundRecord> {
    const step = ladderFor(number);
    const recentWords = new Set(await this.cache.readRecentWords(session.playerId));

    const { round } = await repos.rounds.createIfAbsent({
      sessionId: session.id,
      number,
      sequence: generateSequence(step, recentWords),
      difficulty: step.bucket,
      separator: step.separator,
    });

    await repos.sessions.compareAndSet(session.id, session.version, {
      currentRoundNumber: number,
    });

    return round;
  }

  /** Rebuilds the verdict of a round that was already scored, so a retry sees the same answer. */
  private async replayFrom(
    repos: RepositoryBundle,
    round: RoundRecord,
    session: SessionRecord,
  ): Promise<VerdictView> {
    if (!round.acceptedResponseId) throw new RoundNotOpenError(round.id, round.status);

    const accepted: ResponseRecord | null = await repos.responses.findById(
      round.acceptedResponseId,
    );
    if (!accepted) throw new RoundNotOpenError(round.id, round.status);

    const current = (await repos.sessions.findById(session.id)) ?? session;
    const openRound = await repos.rounds.findOpenForSession(session.id);

    return {
      replayed: true,
      roundId: round.id,
      roundNumber: round.number,
      correct: accepted.isCorrect ?? false,
      outcome: round.outcome ?? 'FAIL',
      expected: round.sequence,
      heardRaw: accepted.transcriptRaw,
      heardTokens: accepted.vocabTokens,
      detail: { firstErrorIndex: null, missing: [], extra: [] },
      points: {
        base: 0,
        speedBonus: 0,
        streakBonus: 0,
        repeatMultiplier: 1,
        total: round.pointsAwarded,
      },
      session: {
        score: current.score,
        roundsCleared: current.roundsCleared,
        strikes: current.strikes,
        maxStrikes: current.maxStrikes,
        status: current.status,
        endReason: current.endReason,
      },
      gameOver: current.endReason !== null,
      nextRound: openRound ? toRoundForBot(openRound) : null,
    };
  }

  /** Cache and leaderboard work, after the transaction has committed. */
  private async afterCommit(command: SubmitAnswerCommand, verdict: VerdictView): Promise<void> {
    const found = await this.repos.sessions.findWithPlayer(command.sessionId);

    if (found) {
      const rounds = await this.repos.rounds.listForSession(command.sessionId);
      await this.cache.writeSession(
        command.sessionId,
        buildSessionView({ session: found.session, player: found.player, rounds }),
        this.config.sessionCacheTtlSeconds,
      );
      await this.cache.pushRecentWords(found.session.playerId, verdict.expected);

      if (verdict.gameOver) {
        await this.onSessionCompleted.execute(found.session, found.player);
      }
    }

    await this.idempotency.complete(
      command.idempotencyKey,
      verdict,
      this.config.idempotencyTtlSeconds,
    );
  }
}

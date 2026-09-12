import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MarkPresented } from '../../../application/rounds/mark-presented';
import { NextRound, type NextRoundResult } from '../../../application/rounds/next-round';
import { RecordEvent } from '../../../application/rounds/record-event';
import { RepeatRound } from '../../../application/rounds/repeat-round';
import { SubmitAnswer } from '../../../application/rounds/submit-answer';
import type { RoundForBot } from '../../../application/sessions/attach-bot';
import type { VerdictView } from '../../../application/views/verdict-view';
import { ValidationError } from '../../../domain/errors';
import { BotCallDto, RecordEventDto, RepeatRoundDto, SubmitAnswerDto } from '../dto/round.dto';
import { InternalTokenGuard } from '../guards/internal-token.guard';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Every turn of the game, called by the voice bot only. The browser never sees these routes: they
 * carry the words of the open round.
 */
@ApiExcludeController()
@UseGuards(InternalTokenGuard)
@Controller('internal/sessions')
export class RoundsInternalController {
  constructor(
    private readonly nextRound: NextRound,
    private readonly markPresented: MarkPresented,
    private readonly submitAnswer: SubmitAnswer,
    private readonly repeatRound: RepeatRound,
    private readonly recordEvent: RecordEvent,
  ) {}

  @Post(':id/rounds/next')
  @HttpCode(HttpStatus.OK)
  next(@Param('id') sessionId: string, @Body() dto: BotCallDto): Promise<NextRoundResult> {
    return this.nextRound.execute({ sessionId, botInstanceId: dto.botInstanceId });
  }

  @Post(':id/rounds/:roundId/presented')
  @HttpCode(HttpStatus.OK)
  presented(
    @Param('id') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() dto: BotCallDto,
  ): Promise<{ round: RoundForBot }> {
    return this.markPresented.execute({ sessionId, roundId, botInstanceId: dto.botInstanceId });
  }

  @Post(':id/rounds/:roundId/answer')
  @HttpCode(HttpStatus.OK)
  answer(
    @Param('id') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() dto: SubmitAnswerDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) headerKey?: string,
  ): Promise<VerdictView> {
    // The key is derived from the attempt, so a client cannot widen or narrow it by accident.
    const idempotencyKey = `${roundId}:${dto.attemptSeq}`;

    if (headerKey !== undefined && headerKey !== idempotencyKey) {
      throw new ValidationError(
        `${IDEMPOTENCY_KEY_HEADER} must be "<roundId>:<attemptSeq>" for this attempt`,
        { expected: idempotencyKey, received: headerKey },
      );
    }

    return this.submitAnswer.execute({
      sessionId,
      roundId,
      botInstanceId: dto.botInstanceId,
      attemptSeq: dto.attemptSeq,
      kind: dto.kind,
      transcript: dto.transcript,
      latencyMs: dto.latencyMs ?? null,
      answeredDuringPresentation: dto.answeredDuringPresentation,
      idempotencyKey,
    });
  }

  @Post(':id/rounds/:roundId/repeat')
  @HttpCode(HttpStatus.OK)
  repeat(
    @Param('id') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() dto: RepeatRoundDto,
  ): Promise<{ round: RoundForBot }> {
    return this.repeatRound.execute({
      sessionId,
      roundId,
      botInstanceId: dto.botInstanceId,
      reason: dto.reason,
    });
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.ACCEPTED)
  async events(@Param('id') sessionId: string, @Body() dto: RecordEventDto): Promise<void> {
    await this.recordEvent.execute({
      sessionId,
      botInstanceId: dto.botInstanceId,
      type: dto.type,
      payload: dto.payload,
    });
  }
}

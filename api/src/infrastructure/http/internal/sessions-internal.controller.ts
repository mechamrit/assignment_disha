import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AttachBot, type AttachBotResult } from '../../../application/sessions/attach-bot';
import { EndSession } from '../../../application/sessions/end-session';
import type { SessionView } from '../../../application/views/session-view';
import { AttachBotDto, EndSessionInternalDto } from '../dto/session.dto';
import { InternalTokenGuard } from '../guards/internal-token.guard';

/**
 * Routes only the voice bot calls, behind the shared internal token. They are kept out of the
 * public OpenAPI document: the browser must never learn a round's words from here.
 */
@ApiExcludeController()
@UseGuards(InternalTokenGuard)
@Controller('internal/sessions')
export class SessionsInternalController {
  constructor(
    private readonly attachBot: AttachBot,
    private readonly endSession: EndSession,
  ) {}

  @Post(':id/attach')
  @HttpCode(HttpStatus.OK)
  attach(@Param('id') id: string, @Body() body: AttachBotDto): Promise<AttachBotResult> {
    return this.attachBot.execute({
      sessionId: id,
      clientToken: body.clientToken,
      botInstanceId: body.botInstanceId,
    });
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id') id: string, @Body() body: EndSessionInternalDto): Promise<SessionView> {
    return this.endSession.execute({
      sessionId: id,
      reason: body.reason,
      botInstanceId: body.botInstanceId,
    });
  }
}

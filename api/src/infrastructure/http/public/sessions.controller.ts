import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CreateSession } from '../../../application/sessions/create-session';
import { EndSession } from '../../../application/sessions/end-session';
import { GetSession } from '../../../application/sessions/get-session';
import { GetSessionRounds } from '../../../application/sessions/get-session-rounds';
import type { SessionView } from '../../../application/views/session-view';
import { ValidationError } from '../../../domain/errors';
import { RoundHistoryDto } from '../dto/round.dto';
import {
  CreateSessionDto,
  CreateSessionResponseDto,
  ErrorDto,
  SessionViewDto,
} from '../dto/session.dto';

export const CLIENT_TOKEN_HEADER = 'x-client-token';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly createSession: CreateSession,
    private readonly getSession: GetSession,
    private readonly getSessionRounds: GetSessionRounds,
    private readonly endSession: EndSession,
  ) {}

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a session and get the token the browser hands to the bot' })
  @ApiResponse({ status: 201, type: CreateSessionResponseDto })
  @ApiResponse({ status: 400, type: ErrorDto })
  create(@Body() body: CreateSessionDto): Promise<CreateSessionResponseDto> {
    return this.createSession.execute({ playerName: body.playerName });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a session. The words of an unfinished round are never included' })
  @ApiResponse({ status: 200, type: SessionViewDto })
  @ApiResponse({ status: 404, type: ErrorDto })
  find(@Param('id') id: string): Promise<SessionView> {
    return this.getSession.execute(id);
  }

  @Get(':id/rounds')
  @ApiOperation({ summary: 'Round history. Words appear only for rounds that have been scored' })
  @ApiResponse({ status: 200, type: RoundHistoryDto })
  @ApiResponse({ status: 404, type: ErrorDto })
  async rounds(@Param('id') id: string): Promise<RoundHistoryDto> {
    return { rounds: await this.getSessionRounds.execute(id) };
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: CLIENT_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'End a session from the browser. Calling it twice is safe' })
  @ApiResponse({ status: 200, type: SessionViewDto })
  @ApiResponse({ status: 401, type: ErrorDto })
  end(
    @Param('id') id: string,
    @Headers(CLIENT_TOKEN_HEADER) clientToken?: string,
  ): Promise<SessionView> {
    if (!clientToken) {
      throw new ValidationError(`${CLIENT_TOKEN_HEADER} header is required`);
    }

    return this.endSession.execute({ sessionId: id, reason: 'CLIENT_END', clientToken });
  }
}

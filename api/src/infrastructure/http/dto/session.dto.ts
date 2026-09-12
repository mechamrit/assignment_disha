import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { END_REASONS, type EndReason } from '../../../domain/types';

export class CreateSessionDto {
  @ApiProperty({ minLength: 2, maxLength: 24, example: 'Asha' })
  @IsString()
  @Length(2, 24)
  playerName!: string;
}

export class AttachBotDto {
  @ApiProperty({ description: 'The token handed to the browser when the session was created' })
  @IsString()
  @MinLength(1)
  clientToken!: string;

  @ApiProperty({ description: 'Identifies this bot process for the life of the session' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  botInstanceId!: string;
}

export class EndSessionInternalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  botInstanceId?: string;

  @ApiProperty({ enum: END_REASONS })
  @IsIn([...END_REASONS])
  reason!: EndReason;
}

export class RoundSummaryDto {
  @ApiProperty() number!: number;
  @ApiProperty() length!: number;
  @ApiProperty() status!: string;
  @ApiProperty() repeats!: number;
}

export class LastRoundDto {
  @ApiProperty() number!: number;
  @ApiProperty({ type: [String] }) sequence!: string[];
  @ApiProperty({ type: [String] }) heard!: string[];
  @ApiProperty() outcome!: string;
  @ApiProperty() pointsAwarded!: number;
}

export class SessionViewDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: Object, example: { name: 'Asha' } }) player!: { name: string };
  @ApiProperty() status!: string;
  @ApiProperty() score!: number;
  @ApiProperty() roundsCleared!: number;
  @ApiProperty() strikes!: number;
  @ApiProperty() maxStrikes!: number;
  @ApiProperty() maxRounds!: number;
  @ApiProperty({ type: RoundSummaryDto, nullable: true }) currentRound!: RoundSummaryDto | null;
  @ApiProperty({ type: LastRoundDto, nullable: true }) lastRound!: LastRoundDto | null;
  @ApiProperty({ nullable: true }) endReason!: string | null;
  @ApiProperty({ nullable: true }) startedAt!: string | null;
  @ApiProperty({ nullable: true }) endedAt!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class CreateSessionResponseDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() clientToken!: string;
  @ApiProperty({ type: Object, example: { id: 'uuid', name: 'Asha' } })
  player!: { id: string; name: string };
  @ApiProperty() status!: string;
  @ApiProperty({ type: Object, example: { offerUrl: 'http://localhost:7860/api/offer' } })
  bot!: { offerUrl: string };
  @ApiProperty({ type: Object, example: { maxStrikes: 1, maxRounds: 15 } })
  config!: { maxStrikes: number; maxRounds: number };
}

export class RoundForBotDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ type: [String] }) sequence!: string[];
  @ApiProperty() separator!: string;
  @ApiProperty() status!: string;
  @ApiProperty() repeats!: number;
}

export class AttachBotResponseDto {
  @ApiProperty({ type: SessionViewDto }) session!: SessionViewDto;
  @ApiProperty({ type: Object }) vocabulary!: { keyterms: string[]; fillers: string[] };
  @ApiProperty({ type: Object }) config!: {
    maxStrikes: number;
    maxRounds: number;
    ladder: { baseLength: number; maxLength: number; hardFromRound: number };
    answerIdleSecs: number;
  };
  @ApiProperty({ type: RoundForBotDto, nullable: true }) currentRound!: RoundForBotDto | null;
}

export class HealthDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: 'up' }) db!: string;
  @ApiProperty({ example: 'ok' }) redis!: string;
  @ApiProperty() uptimeSec!: number;
}

export class ErrorDto {
  @ApiProperty() statusCode!: number;
  @ApiProperty({ example: 'SESSION_NOT_FOUND' }) code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: Object }) details?: Record<string, unknown>;
}

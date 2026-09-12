import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const ANSWER_KINDS = ['ANSWER', 'TIMEOUT', 'GIVE_UP'] as const;
export const REPEAT_REASONS = ['REQUESTED', 'INTERRUPTED'] as const;

export class BotCallDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  botInstanceId!: string;
}

export class SubmitAnswerDto extends BotCallDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  attemptSeq!: number;

  @ApiProperty({ enum: ANSWER_KINDS })
  @IsIn([...ANSWER_KINDS])
  kind!: (typeof ANSWER_KINDS)[number];

  @ApiProperty({ description: 'Raw speech-to-text output; empty for a timeout' })
  @IsString()
  @MaxLength(2000)
  transcript!: string;

  @ApiPropertyOptional({ description: 'Milliseconds from the end of the read-out to the answer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  latencyMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  answeredDuringPresentation?: boolean;
}

export class RepeatRoundDto extends BotCallDto {
  @ApiProperty({ enum: REPEAT_REASONS })
  @IsIn([...REPEAT_REASONS])
  reason!: (typeof REPEAT_REASONS)[number];
}

export class RecordEventDto extends BotCallDto {
  @ApiProperty({ example: 'INTERRUPTION' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  type!: string;

  @ApiProperty({ type: Object, default: {} })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class RoundHistoryItemDto {
  @ApiProperty() number!: number;
  @ApiProperty() length!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) outcome!: string | null;
  @ApiProperty() repeats!: number;
  @ApiProperty() pointsAwarded!: number;
  @ApiPropertyOptional({ type: [String], description: 'Only once the round has been scored' })
  sequence?: string[];
  @ApiPropertyOptional({ type: [String] }) heard?: string[];
}

export class RoundHistoryDto {
  @ApiProperty({ type: [RoundHistoryItemDto] }) rounds!: RoundHistoryItemDto[];
}

export class RecentScoreDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() playerName!: string;
  @ApiProperty() score!: number;
  @ApiProperty() roundsCleared!: number;
  @ApiProperty() endedAt!: string;
  @ApiProperty({ nullable: true }) endReason!: string | null;
}

export class RecentScoresDto {
  @ApiProperty({ type: [RecentScoreDto] }) scores!: RecentScoreDto[];
}

export class LeaderboardEntryDto {
  @ApiProperty() rank!: number;
  @ApiProperty() playerId!: string;
  @ApiProperty() playerName!: string;
  @ApiProperty() bestScore!: number;
  @ApiProperty() bestRounds!: number;
  @ApiProperty() achievedAt!: string;
}

export class LeaderboardDto {
  @ApiProperty({ type: [LeaderboardEntryDto] }) entries!: LeaderboardEntryDto[];
}

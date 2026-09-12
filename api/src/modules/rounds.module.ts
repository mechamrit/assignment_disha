import { Module } from '@nestjs/common';
import { MarkPresented } from '../application/rounds/mark-presented';
import { NextRound } from '../application/rounds/next-round';
import { RecordEvent } from '../application/rounds/record-event';
import { RepeatRound } from '../application/rounds/repeat-round';
import { SubmitAnswer } from '../application/rounds/submit-answer';
import { RoundsInternalController } from '../infrastructure/http/internal/rounds-internal.controller';
import { LeaderboardModule } from './leaderboard.module';

@Module({
  imports: [LeaderboardModule],
  controllers: [RoundsInternalController],
  providers: [NextRound, MarkPresented, SubmitAnswer, RepeatRound, RecordEvent],
  exports: [NextRound, MarkPresented, SubmitAnswer, RepeatRound, RecordEvent],
})
export class RoundsModule {}

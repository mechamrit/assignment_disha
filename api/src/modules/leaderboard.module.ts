import { Module } from '@nestjs/common';
import { GetLeaderboard } from '../application/leaderboard/get-leaderboard';
import { GetRecentScores } from '../application/leaderboard/get-recent-scores';
import { OnSessionCompleted } from '../application/leaderboard/on-session-completed';
import { ScoresController } from '../infrastructure/http/public/scores.controller';

@Module({
  controllers: [ScoresController],
  providers: [GetLeaderboard, GetRecentScores, OnSessionCompleted],
  // Sessions and rounds both finish games, so they share the completion hook.
  exports: [OnSessionCompleted],
})
export class LeaderboardModule {}

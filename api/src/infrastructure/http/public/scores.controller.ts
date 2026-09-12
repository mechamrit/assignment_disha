import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetLeaderboard } from '../../../application/leaderboard/get-leaderboard';
import { GetRecentScores } from '../../../application/leaderboard/get-recent-scores';
import { LeaderboardDto, RecentScoresDto } from '../dto/round.dto';

const MAX_LIMIT = 50;

@ApiTags('scores')
@Controller()
export class ScoresController {
  constructor(
    private readonly getRecentScores: GetRecentScores,
    private readonly getLeaderboard: GetLeaderboard,
  ) {}

  @Get('scores/recent')
  @ApiOperation({ summary: 'The last finished games, newest first' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, type: RecentScoresDto })
  async recent(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<RecentScoresDto> {
    const scores = await this.getRecentScores.execute(clamp(limit));

    return {
      scores: scores.map((score) => ({
        sessionId: score.sessionId,
        playerName: score.playerName,
        score: score.score,
        roundsCleared: score.roundsCleared,
        endedAt: new Date(score.endedAt).toISOString(),
        endReason: score.endReason,
      })),
    };
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Best score per player' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, type: LeaderboardDto })
  async leaderboard(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<LeaderboardDto> {
    const entries = await this.getLeaderboard.execute(clamp(limit));

    return {
      entries: entries.map((entry) => ({
        rank: entry.rank,
        playerId: entry.playerId,
        playerName: entry.playerName,
        bestScore: entry.bestScore,
        bestRounds: entry.bestRounds,
        achievedAt: new Date(entry.achievedAt).toISOString(),
      })),
    };
  }
}

function clamp(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return 1;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

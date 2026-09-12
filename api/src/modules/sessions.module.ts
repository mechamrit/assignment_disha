import { Module } from '@nestjs/common';
import { AttachBot } from '../application/sessions/attach-bot';
import { CreateSession } from '../application/sessions/create-session';
import { EndSession } from '../application/sessions/end-session';
import { ExpireStaleSessions } from '../application/sessions/expire-stale-sessions';
import { GetSession } from '../application/sessions/get-session';
import { GetSessionRounds } from '../application/sessions/get-session-rounds';
import { SessionsInternalController } from '../infrastructure/http/internal/sessions-internal.controller';
import { SessionsController } from '../infrastructure/http/public/sessions.controller';
import { SweeperService } from '../infrastructure/scheduling/sweeper';
import { LeaderboardModule } from './leaderboard.module';

@Module({
  imports: [LeaderboardModule],
  controllers: [SessionsController, SessionsInternalController],
  providers: [
    CreateSession,
    GetSession,
    GetSessionRounds,
    AttachBot,
    EndSession,
    ExpireStaleSessions,
    SweeperService,
  ],
  exports: [
    CreateSession,
    GetSession,
    GetSessionRounds,
    AttachBot,
    EndSession,
    ExpireStaleSessions,
  ],
})
export class SessionsModule {}

import { Module } from '@nestjs/common';
import { AttachBot } from '../application/sessions/attach-bot';
import { CreateSession } from '../application/sessions/create-session';
import { EndSession } from '../application/sessions/end-session';
import { ExpireStaleSessions } from '../application/sessions/expire-stale-sessions';
import { GetSession } from '../application/sessions/get-session';
import { SessionsInternalController } from '../infrastructure/http/internal/sessions-internal.controller';
import { SessionsController } from '../infrastructure/http/public/sessions.controller';
import { SweeperService } from '../infrastructure/scheduling/sweeper';

@Module({
  controllers: [SessionsController, SessionsInternalController],
  providers: [
    CreateSession,
    GetSession,
    AttachBot,
    EndSession,
    ExpireStaleSessions,
    SweeperService,
  ],
  exports: [CreateSession, GetSession, AttachBot, EndSession, ExpireStaleSessions],
})
export class SessionsModule {}

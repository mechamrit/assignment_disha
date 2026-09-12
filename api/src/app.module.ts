import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { DomainErrorFilter } from './infrastructure/http/filters/domain-error.filter';
import { HealthModule } from './modules/health.module';
import { InfraModule } from './modules/infra.module';
import { SessionsModule } from './modules/sessions.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: { ignore: (request) => request.url === '/health' },
        redact: ['req.headers["x-internal-token"]', 'req.headers["x-client-token"]'],
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
      },
    }),
    ScheduleModule.forRoot(),
    // Applied by the create-session route only; other routes are not rate limited.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    InfraModule,
    SessionsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}

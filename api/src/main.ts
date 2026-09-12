import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadDotEnvFile } from './config/dotenv';
import { ENV, type Env } from './config/env';
import { setupSwagger } from './infrastructure/http/swagger';

async function bootstrap(): Promise<void> {
  loadDotEnvFile();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);

  app.enableCors({
    origin: env.WEB_ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-client-token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  setupSwagger(app);

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();

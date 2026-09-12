import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { loadDotEnvFile } from '../src/config/dotenv';
import { buildOpenApiDocument } from '../src/infrastructure/http/swagger';

/**
 * Boots the app in memory, writes the Swagger document to contracts/openapi.json, and exits.
 * `make contracts-check` runs this and fails when the committed file no longer matches the code.
 */
async function emit(): Promise<void> {
  loadDotEnvFile(resolve(__dirname, '../.env'));

  const target = resolve(__dirname, '../../contracts/openapi.json');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();

  const document = buildOpenApiDocument(app);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  process.stdout.write(`wrote ${target}\n`);
}

emit().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
  process.exit(1);
});

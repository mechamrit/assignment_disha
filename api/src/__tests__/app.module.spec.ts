import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';

describe('AppModule on the Fastify adapter', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('routes requests through Nest and answers unknown paths with a 404 error body', async () => {
    const res = await app.inject({ method: 'GET', url: '/unknown' });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});

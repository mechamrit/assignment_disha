import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/infrastructure/http/swagger';
import { body, type OpenApiBody } from './inject';

/**
 * The API documents itself at /docs, and the same document is what `make contracts-emit` writes
 * to contracts/openapi.json. Internal bot routes must stay out of it.
 */
describe('swagger docs (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    setupSwagger(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the documentation page', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('serves the OpenAPI document with the public routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs-json' });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(body<OpenApiBody>(res).paths).sort()).toEqual([
      '/health',
      '/sessions',
      '/sessions/{id}',
      '/sessions/{id}/end',
    ]);
  });

  it('keeps the internal bot routes out of the public document', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs-json' });

    expect(res.body).not.toContain('/internal/');
  });
});

import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * One Swagger document, used both for the browsable docs at /docs and for the committed
 * contracts/openapi.json that the web and bot clients are generated from.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Memory Card API')
    .setDescription(
      'Game API for the Memory Card voice game. Scoring happens here and nowhere else.',
    )
    .setVersion('0.1.0')
    .addTag('sessions')
    .addTag('health')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);
  return document;
}

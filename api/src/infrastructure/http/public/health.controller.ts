import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CACHE, type CachePort } from '../../../application/ports/cache.port';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthDto } from '../dto/session.dto';

/**
 * Liveness for humans and containers. Postgres is required, so a database outage answers 503.
 * Redis is a cache, so losing it degrades the response without failing it.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE) private readonly cache: CachePort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service health' })
  @ApiResponse({ status: 200, type: HealthDto })
  @ApiResponse({ status: 503, type: HealthDto })
  async check(@Res() reply: FastifyReply): Promise<void> {
    const [dbUp, redisUp] = await Promise.all([this.prisma.isHealthy(), this.cache.isHealthy()]);

    const body: HealthDto = {
      status: dbUp ? 'ok' : 'error',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'ok' : 'degraded',
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
    };

    await reply.status(dbUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).send(body);
  }
}

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from '../../../config/env';
import { ID, type IdPort } from '../../../application/ports/id.port';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * Guards every /internal route. The comparison is constant time, so a wrong token leaks nothing
 * about how much of it was right.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(ID) private readonly ids: IdPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[INTERNAL_TOKEN_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !this.ids.safeEquals(provided, this.env.INTERNAL_API_TOKEN)) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_CLIENT_TOKEN',
        message: 'Missing or invalid internal token',
      });
    }

    return true;
  }
}

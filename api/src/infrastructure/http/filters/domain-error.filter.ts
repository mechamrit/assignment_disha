import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DomainError } from '../../../domain/errors';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * One error shape for the whole API: `{ statusCode, code, message, details? }`, as specified in
 * docs/PLAN.md. Domain errors carry their own code; anything unexpected becomes INTERNAL and is
 * logged with its stack rather than shown to the caller.
 */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    void reply.status(body.statusCode).send(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof DomainError) {
      return {
        statusCode: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();

      if (typeof response === 'object' && response !== null && 'code' in response) {
        return { ...(response as ErrorBody), statusCode: status };
      }

      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? String(response.message)
          : exception.message;

      return {
        statusCode: status,
        code: status === 400 ? 'VALIDATION' : 'HTTP_ERROR',
        message,
      };
    }

    return {
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Unexpected error',
    };
  }
}

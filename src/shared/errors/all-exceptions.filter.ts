import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../domain/domain-error.js';
import {
  DEFAULT_ERROR_CODE,
  DOMAIN_ERROR_STATUS,
  HTTP_STATUS_TO_CODE,
} from './error-codes.js';

interface Resolved {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Single catch-all: turns every exception (framework, validation, domain,
 * unknown) into the { status: 'error', error: {...} } envelope. 5xx messages
 * are never sent to the client in production, but are always logged in full.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ headers: Record<string, string | undefined> }>();

    const { statusCode, code, message, details } = this.resolve(exception);
    const traceId = request.headers['x-request-id'] || randomUUID();
    const timestamp = new Date().toISOString();

    if (statusCode >= 500) {
      const real = exception instanceof Error ? exception.message : JSON.stringify(exception);
      this.logger.error(
        `[${code}] ${real} (traceId=${traceId})`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${code}] ${message} (traceId=${traceId})`);
    }

    httpAdapter.reply(
      ctx.getResponse(),
      {
        status: 'error',
        error: { code, message, ...(details ? { details } : {}), traceId, timestamp },
        timestamp,
      },
      statusCode,
    );
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof DomainError) {
      const statusCode = DOMAIN_ERROR_STATUS[exception.code];
      if (statusCode) return { statusCode, code: exception.code, message: exception.message };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const raw = obj.message ?? body;
      const message = Array.isArray(raw)
        ? raw.join('; ')
        : typeof raw === 'string'
          ? raw
          : exception.message;
      const code =
        typeof obj.code === 'string'
          ? obj.code
          : (HTTP_STATUS_TO_CODE[statusCode] ?? DEFAULT_ERROR_CODE);
      return { statusCode, code, message, details: obj.details };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: DEFAULT_ERROR_CODE,
      message:
        process.env.NODE_ENV === 'development' && exception instanceof Error
          ? exception.message
          : 'An unexpected error occurred',
    };
  }
}

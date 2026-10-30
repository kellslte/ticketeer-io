import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

/**
 * Wraps successful responses in { status, data, timestamp }. Handlers that
 * return nothing (204) are left untouched. Errors are shaped by AllExceptionsFilter.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data: unknown) =>
        data === undefined
          ? data
          : { status: 'success' as const, data, timestamp: new Date().toISOString() },
      ),
    );
  }
}

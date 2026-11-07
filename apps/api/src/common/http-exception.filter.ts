import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; requestId?: string };
}

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Converts all errors to the standard error envelope. Never leaks internal error details. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = res.locals?.requestId as string | undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'ERROR';
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as { code?: unknown; message?: unknown };
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string') message = b.message;
      } else if (typeof body === 'string') {
        message = body;
      }
    } else {
      this.logger.error({ requestId, err: exception });
    }

    const envelope: ErrorEnvelope = { success: false, error: { code, message, requestId } };
    res.status(status).json(envelope);
  }
}

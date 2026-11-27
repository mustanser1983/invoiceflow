import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { pgErrorCode } from './pg-errors.js';

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: ErrorDetail[]; requestId?: string };
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

/** Postgres error codes that are the caller's fault rather than a server bug. */
const PG_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'DUPLICATE', message: 'This record already exists' },
  '23503': { status: 400, code: 'VALIDATION_ERROR', message: 'A referenced record does not exist' },
  '23514': {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Please check the submitted information',
  },
  '42501': { status: 404, code: 'NOT_FOUND', message: 'Not found' },
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
    let details: ErrorDetail[] | undefined;

    const pgCode = pgErrorCode(exception);
    const pgMapped = pgCode ? PG_ERRORS[pgCode] : undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'ERROR';
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as { code?: unknown; message?: unknown; details?: unknown };
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string') message = b.message;
        if (Array.isArray(b.details)) details = b.details as ErrorDetail[];
      } else if (typeof body === 'string') {
        message = body;
      }
    } else if (pgMapped) {
      ({ status, code, message } = pgMapped);
      // 42501 = RLS rejected a write: treat like a missing record, but log it.
      if (pgCode === '42501') this.logger.warn({ requestId, msg: 'RLS policy violation' });
    } else {
      this.logger.error({ requestId, err: exception });
    }

    const envelope: ErrorEnvelope = { success: false, error: { code, message, requestId } };
    if (details) envelope.error.details = details;
    res.status(status).json(envelope);
  }
}

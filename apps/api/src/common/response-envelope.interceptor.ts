import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
}

/** Wraps successful responses in the standard envelope (ARCHITECTURE_AND_API.md §7.1). */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data, message: 'Request completed' })));
  }
}

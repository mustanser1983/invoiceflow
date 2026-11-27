import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Paginated } from './pagination.js';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Paginated<unknown>['meta'];
  message: string;
}

/** Wraps successful responses in the standard envelope (ARCHITECTURE_AND_API.md §7.1). */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<unknown>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<unknown>> {
    return next
      .handle()
      .pipe(
        map((data) =>
          data instanceof Paginated
            ? { success: true, data: data.items, meta: data.meta, message: 'Request completed' }
            : { success: true, data, message: 'Request completed' },
        ),
      );
  }
}

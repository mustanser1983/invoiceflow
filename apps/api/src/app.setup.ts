import { INestApplication, RequestMethod } from '@nestjs/common';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';

/** Shared app configuration, used by main.ts and by e2e tests. */
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/db', method: RequestMethod.GET },
    ],
  });
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}

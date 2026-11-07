import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';
const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Assigns every request an id, returned in X-Request-Id and used in errors and logs. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const id = incoming && VALID_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

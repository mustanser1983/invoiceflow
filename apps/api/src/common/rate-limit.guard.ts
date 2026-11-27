import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const RATE_LIMIT = 'invoiceflow:rateLimit';
const SKIP_RATE_LIMIT = 'invoiceflow:skipRateLimit';

/** Override the default per-IP limit for a route or controller. */
export const RateLimit = (limit: number, windowMs = 60_000) =>
  SetMetadata(RATE_LIMIT, { limit, windowMs } satisfies RateLimitOptions);

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);

/** General limit per client IP (ARCHITECTURE_AND_API.md §6.1). */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 300, windowMs: 60_000 };

/**
 * Fixed-window, in-memory limiter keyed by IP and route. Good enough for a single API instance;
 * when the API scales out, move limits to the edge (WAF) or a shared store.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, targets)) return true;
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT, targets) ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const now = Date.now();
    this.sweep(now);

    const key = `${req.ip ?? 'unknown'}|${context.getClass().name}.${context.getHandler().name}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + options.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;

    if (window.count > options.limit) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}

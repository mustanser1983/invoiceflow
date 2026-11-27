import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_PROVIDER,
  AuthProviderNotConfiguredError,
  type AuthProvider,
  type VerifiedIdentity,
} from '../../infrastructure/auth/auth-provider.js';
import { IS_PUBLIC } from './decorators.js';

export type AuthenticatedRequest = Request & { identity?: VerifiedIdentity };

/** Verifies the bearer token for every non-public route. No database access here. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match?.[1]) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please sign in' });
    }

    try {
      req.identity = await this.authProvider.verifyToken(match[1]);
    } catch (err) {
      if (err instanceof AuthProviderNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: 'AUTH_NOT_CONFIGURED',
          message: 'Sign-in is not available right now',
        });
      }
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Your session has expired. Please sign in again.',
      });
    }
    return true;
  }
}

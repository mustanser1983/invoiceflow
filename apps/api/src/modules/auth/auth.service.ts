import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUTH_PROVIDER,
  AuthProviderNotConfiguredError,
  authSubject,
  type AuthProvider,
} from '../../infrastructure/auth/auth-provider.js';
import { users } from '../../infrastructure/db/schema/index.js';
import { setContext } from '../../infrastructure/db/transaction-manager.js';
import { ctx, currentUser } from '../../common/context/request-context.js';
import { isUniqueViolation } from '../../common/pg-errors.js';
import { AuditService } from '../audit/audit.service.js';
import { listMemberships, type MembershipView } from '../access/memberships.js';
import type { RegisterInput } from './auth.dto.js';

export interface MeView {
  user: { id: string; email: string; fullName: string; emailVerified: boolean };
  memberships: MembershipView[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
    private readonly audit: AuditService,
  ) {}

  /** Creates our user record for a signed-in provider identity. Idempotent per identity. */
  async register(input: RegisterInput): Promise<{ created: boolean; me: MeView }> {
    const { tx, identity, user } = ctx();
    if (user) return { created: false, me: await this.me() };

    if (!identity.email) {
      throw new BadRequestException({
        code: 'EMAIL_REQUIRED',
        message: 'Your sign-in account has no email address',
      });
    }

    const id = randomUUID();
    const subject = authSubject(identity);
    try {
      await tx.insert(users).values({
        id,
        authProvider: identity.provider,
        authProviderId: identity.providerUserId,
        fullName: input.fullName,
        email: identity.email,
        phone: input.phone ?? null,
        emailVerifiedAt: identity.emailVerified ? new Date() : null,
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_key')) {
        throw new ConflictException({
          code: 'EMAIL_IN_USE',
          message: 'An account with this email already exists',
        });
      }
      throw err;
    }

    await setContext(tx, { authSubject: subject, userId: id });
    const store = ctx();
    store.user = {
      id,
      email: identity.email,
      fullName: input.fullName,
      emailVerified: identity.emailVerified,
    };
    await this.audit.record({
      action: 'user.registered',
      entityType: 'user',
      entityId: id,
      after: { fullName: input.fullName, email: identity.email },
      tenantId: null,
    });
    return { created: true, me: await this.me() };
  }

  async me(): Promise<MeView> {
    const user = currentUser();
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
      },
      memberships: await listMemberships(ctx().tx, user.id),
    };
  }

  /** Signs the user out on every device by revoking refresh tokens at the provider. */
  async logout(): Promise<void> {
    const { identity } = ctx();
    try {
      await this.authProvider.revokeSessions(identity.providerUserId);
    } catch (err) {
      if (err instanceof AuthProviderNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: 'AUTH_NOT_CONFIGURED',
          message: 'Signing out of all devices is not available right now',
        });
      }
      throw err;
    }
    await this.audit.record({
      action: 'user.logged_out',
      entityType: 'user',
      entityId: currentUser().id,
      tenantId: null,
    });
  }
}

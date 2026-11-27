import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { from, lastValueFrom, Observable } from 'rxjs';
import { authSubject } from '../../infrastructure/auth/auth-provider.js';
import {
  permissions,
  rolePermissions,
  tenantMemberships,
  tenants,
  users,
} from '../../infrastructure/db/schema/index.js';
import {
  setContext,
  TransactionManager,
  type Tx,
} from '../../infrastructure/db/transaction-manager.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import {
  ALLOW_UNREGISTERED,
  IS_PUBLIC,
  REQUIRED_PERMISSIONS,
  TENANT_SCOPE,
  type TenantScopeOptions,
} from './decorators.js';
import {
  requestContextStorage,
  type CurrentTenant,
  type CurrentUser,
  type RequestContext,
} from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TENANT_DENIED = () =>
  new ForbiddenException({
    code: 'TENANT_ACCESS_DENIED',
    message: 'You do not have access to this business',
  });

/**
 * Wraps every authenticated request in one database transaction (ARCHITECTURE_AND_API.md §3.1):
 * resolves the user, checks tenant membership and permissions, sets RLS context, then runs the
 * handler inside the same transaction. Any error rolls everything back.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly transactions: TransactionManager,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return next.handle();

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const identity = req.identity;
    if (!identity) throw new Error('AuthGuard did not attach an identity');

    const allowUnregistered =
      this.reflector.getAllAndOverride<boolean>(ALLOW_UNREGISTERED, targets) ?? false;
    const required = this.reflector.getAllAndMerge<string[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    const scope = this.reflector.getAllAndOverride<TenantScopeOptions | undefined>(
      TENANT_SCOPE,
      targets,
    );
    const tenantScoped = scope !== undefined || required.length > 0;
    const tenantId = tenantScoped ? this.readTenantId(req, scope) : undefined;
    const subject = authSubject(identity);

    return from(
      this.transactions.run({ authSubject: subject }, async (tx) => {
        const user = await this.resolveUser(tx, subject, identity.emailVerified);
        if (!user && !allowUnregistered) {
          throw new ForbiddenException({
            code: 'USER_NOT_REGISTERED',
            message: 'Please finish creating your account',
          });
        }

        await setContext(tx, { authSubject: subject, userId: user?.id, tenantId });

        let tenant: CurrentTenant | undefined;
        if (tenantId) {
          if (!user) throw TENANT_DENIED();
          tenant = await this.resolveTenant(tx, tenantId, user.id);
          const missing = required.filter((code) => !tenant!.permissions.has(code));
          if (missing.length > 0) {
            throw new ForbiddenException({
              code: 'PERMISSION_DENIED',
              message: 'You do not have permission to do this',
            });
          }
        }

        const store: RequestContext = {
          tx,
          identity,
          user,
          tenant,
          requestId: res.locals?.requestId as string | undefined,
          ipAddress: req.ip,
          userAgent: req.header('user-agent'),
        };
        return requestContextStorage.run(store, () =>
          lastValueFrom(next.handle(), { defaultValue: undefined }),
        );
      }),
    );
  }

  private readTenantId(req: AuthenticatedRequest, scope: TenantScopeOptions | undefined): string {
    const raw = scope?.param ? req.params[scope.param] : req.header('x-tenant-id');
    if (typeof raw !== 'string' || raw === '') {
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'Choose a business first',
      });
    }
    // Never reveal whether a malformed id could exist.
    if (!UUID.test(raw)) throw TENANT_DENIED();
    if (scope?.param) {
      const header = req.header('x-tenant-id');
      if (header !== undefined && header !== raw) throw TENANT_DENIED();
    }
    return raw.toLowerCase();
  }

  private async resolveUser(
    tx: Tx,
    subject: string,
    emailVerified: boolean,
  ): Promise<CurrentUser | undefined> {
    const [row] = await tx
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(sql`${users.authProvider} || ':' || ${users.authProviderId} = ${subject}`)
      .limit(1);
    if (!row) return undefined;
    if (row.status !== 'active') {
      throw new ForbiddenException({ code: 'USER_DISABLED', message: 'This account is disabled' });
    }

    // Keep our copy of the verification flag in step with the provider.
    if (emailVerified && !row.emailVerifiedAt) {
      await setContext(tx, { authSubject: subject, userId: row.id });
      await tx
        .update(users)
        .set({ emailVerifiedAt: sql`now()` })
        .where(and(eq(users.id, row.id), isNull(users.emailVerifiedAt)));
    }

    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      emailVerified: emailVerified || row.emailVerifiedAt !== null,
    };
  }

  private async resolveTenant(tx: Tx, tenantId: string, userId: string): Promise<CurrentTenant> {
    const [membership] = await tx
      .select({
        id: tenantMemberships.id,
        roleId: tenantMemberships.roleId,
        isOwner: tenantMemberships.isOwner,
        tenantStatus: tenants.status,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, userId),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!membership || membership.tenantStatus === 'closed') throw TENANT_DENIED();

    const granted = await tx
      .select({ code: permissions.permissionCode })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, membership.roleId));

    return {
      id: tenantId,
      membershipId: membership.id,
      roleId: membership.roleId,
      isOwner: membership.isOwner,
      permissions: new Set(granted.map((g) => g.code)),
    };
  }
}

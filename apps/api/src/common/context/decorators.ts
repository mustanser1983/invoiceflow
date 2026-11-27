import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'invoiceflow:isPublic';
export const ALLOW_UNREGISTERED = 'invoiceflow:allowUnregistered';
export const TENANT_SCOPE = 'invoiceflow:tenantScope';
export const REQUIRED_PERMISSIONS = 'invoiceflow:requiredPermissions';

/** No token, no database context (health checks). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Valid token required, but the user need not have registered yet (POST /auth/register). */
export const AllowUnregistered = () => SetMetadata(ALLOW_UNREGISTERED, true);

export interface TenantScopeOptions {
  /** Take the tenant id from this route param instead of the X-Tenant-Id header. */
  param?: string;
}

/**
 * The route acts on one tenant. The caller must have an active membership in it; the request's
 * transaction is restricted to that tenant by RLS.
 */
export const TenantScoped = (options: TenantScopeOptions = {}) =>
  SetMetadata(TENANT_SCOPE, options);

/** Permission codes the caller's role must grant (all of them). Implies @TenantScoped(). */
export const RequirePermissions = (...codes: string[]) => SetMetadata(REQUIRED_PERMISSIONS, codes);

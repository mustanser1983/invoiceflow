import { AsyncLocalStorage } from 'node:async_hooks';
import { InternalServerErrorException } from '@nestjs/common';
import type { VerifiedIdentity } from '../../infrastructure/auth/auth-provider.js';
import type { Tx } from '../../infrastructure/db/transaction-manager.js';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

export interface CurrentTenant {
  id: string;
  membershipId: string;
  roleId: string;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}

export interface RequestContext {
  tx: Tx;
  identity: VerifiedIdentity;
  user: CurrentUser | undefined;
  tenant: CurrentTenant | undefined;
  requestId: string | undefined;
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContextStorage = storage;

/** The current request's context. Throws if called outside a request transaction. */
export function ctx(): RequestContext {
  const current = storage.getStore();
  if (!current) {
    throw new InternalServerErrorException('Request context is not available');
  }
  return current;
}

export function currentUser(): CurrentUser {
  const user = ctx().user;
  if (!user) throw new InternalServerErrorException('No registered user in this request');
  return user;
}

export function currentTenant(): CurrentTenant {
  const tenant = ctx().tenant;
  if (!tenant) throw new InternalServerErrorException('No tenant in this request');
  return tenant;
}

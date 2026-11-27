/** A verified identity from the managed auth provider (ADR-0002). */
export interface VerifiedIdentity {
  provider: string;
  providerUserId: string;
  email: string | undefined;
  emailVerified: boolean;
  name: string | undefined;
}

/** Thrown when a token is missing, malformed, expired or revoked. */
export class InvalidTokenError extends Error {}

/** Thrown when an operation needs provider configuration that isn't present. */
export class AuthProviderNotConfiguredError extends Error {}

/**
 * Abstraction over the managed auth provider so it can be replaced (ADR-0002).
 * Authorisation (tenants, roles, permissions) never lives here.
 */
export interface AuthProvider {
  verifyToken(token: string): Promise<VerifiedIdentity>;
  /** Revokes all refresh tokens for the user (logout everywhere). */
  revokeSessions(providerUserId: string): Promise<void>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export function authSubject(identity: Pick<VerifiedIdentity, 'provider' | 'providerUserId'>) {
  return `${identity.provider}:${identity.providerUserId}`;
}

import {
  InvalidTokenError,
  type AuthProvider,
  type VerifiedIdentity,
} from '../../src/infrastructure/auth/auth-provider.js';

/**
 * Test-only provider. Tokens look like `test|<uid>|<email>|<verified 0/1>`.
 * Never registered outside tests.
 */
export class FakeAuthProvider implements AuthProvider {
  readonly revoked: string[] = [];

  async verifyToken(token: string): Promise<VerifiedIdentity> {
    const [kind, uid, email, verified] = token.split('|');
    if (kind !== 'test' || !uid) throw new InvalidTokenError('bad test token');
    return {
      provider: 'test',
      providerUserId: uid,
      email: email || undefined,
      emailVerified: verified === '1',
      name: undefined,
    };
  }

  async revokeSessions(providerUserId: string): Promise<void> {
    this.revoked.push(providerUserId);
  }
}

export function token(uid: string, email = `${uid}@example.test`, verified = true): string {
  return `Bearer test|${uid}|${email}|${verified ? '1' : '0'}`;
}

import { Injectable, Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import { loadEnv } from '../../config/env.js';
import {
  AuthProviderNotConfiguredError,
  InvalidTokenError,
  type AuthProvider,
  type VerifiedIdentity,
} from './auth-provider.js';

const APP_NAME = 'invoiceflow';

/**
 * Verifies Firebase ID tokens. Verification needs only the project id (public signing keys).
 * Revoking sessions needs service-account credentials via GOOGLE_APPLICATION_CREDENTIALS.
 *
 * firebase-admin is loaded on first use: it isn't needed when Firebase isn't configured, and
 * its dependencies include ES-module-only packages that Jest on Node 22 can't load.
 */
@Injectable()
export class FirebaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(FirebaseAuthProvider.name);
  private readonly projectId = loadEnv().FIREBASE_PROJECT_ID;
  private readonly hasCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  private auth: Promise<Auth> | undefined;

  constructor() {
    if (!this.projectId) this.logger.warn('FIREBASE_PROJECT_ID is not set; sign-in is disabled.');
  }

  private getAuth(): Promise<Auth> {
    if (!this.projectId) {
      return Promise.reject(new AuthProviderNotConfiguredError('Firebase is not configured'));
    }
    this.auth ??= (async () => {
      const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      const app: App =
        getApps().find((a) => a.name === APP_NAME) ??
        initializeApp(
          {
            projectId: this.projectId,
            ...(this.hasCredentials ? { credential: applicationDefault() } : {}),
          },
          APP_NAME,
        );
      return getAuth(app);
    })();
    return this.auth;
  }

  async verifyToken(token: string): Promise<VerifiedIdentity> {
    const auth = await this.getAuth();
    try {
      // checkRevoked needs credentials; without them we rely on short token lifetimes.
      const decoded = await auth.verifyIdToken(token, this.hasCredentials);
      return {
        provider: 'firebase',
        providerUserId: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
        name: typeof decoded.name === 'string' ? decoded.name : undefined,
      };
    } catch {
      throw new InvalidTokenError('Invalid or expired token');
    }
  }

  async revokeSessions(providerUserId: string): Promise<void> {
    if (!this.hasCredentials) {
      throw new AuthProviderNotConfiguredError('Firebase admin credentials are not configured');
    }
    const auth = await this.getAuth();
    await auth.revokeRefreshTokens(providerUserId);
  }
}

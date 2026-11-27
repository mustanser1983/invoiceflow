import { Global, Module } from '@nestjs/common';
import { AUTH_PROVIDER } from './auth-provider.js';
import { FirebaseAuthProvider } from './firebase-auth.provider.js';

@Global()
@Module({
  providers: [{ provide: AUTH_PROVIDER, useClass: FirebaseAuthProvider }],
  exports: [AUTH_PROVIDER],
})
export class AuthProviderModule {}

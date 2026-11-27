import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { AuthGuard } from './common/context/auth.guard.js';
import { RequestContextInterceptor } from './common/context/request-context.interceptor.js';
import { AuthProviderModule } from './infrastructure/auth/auth-provider.module.js';
import { DbModule } from './infrastructure/db/db.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';

@Module({
  imports: [DbModule, AuthProviderModule, AuditModule, HealthModule, AuthModule, TenantsModule],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
export class AppModule {}

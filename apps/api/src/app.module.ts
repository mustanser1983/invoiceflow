import { Module } from '@nestjs/common';
import { DbModule } from './infrastructure/db/db.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [DbModule, HealthModule],
})
export class AppModule {}

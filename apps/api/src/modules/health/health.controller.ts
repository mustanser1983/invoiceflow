import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DbService } from '../../infrastructure/db/db.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly dbService: DbService) {}

  /** Liveness: the process is up. */
  @Get()
  check(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: the database answers SELECT 1. */
  @Get('db')
  async checkDb(): Promise<{ status: 'ok'; latencyMs: number }> {
    if (!this.dbService.isConfigured) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_CONFIGURED',
        message: 'Database connection is not configured',
      });
    }
    try {
      const latencyMs = await this.dbService.ping();
      return { status: 'ok', latencyMs };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not reachable',
      });
    }
  }
}

import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { RequirePermissions, TenantScoped } from '../../common/context/decorators.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import type { MembershipView } from '../access/memberships.js';
import {
  createTenantSchema,
  updateNumberingSchema,
  updateSettingsSchema,
  updateTenantSchema,
  type CreateTenantInput,
  type UpdateNumberingInput,
  type UpdateSettingsInput,
  type UpdateTenantInput,
} from './tenants.dto.js';
import type { Settings } from './tenant-defaults.js';
import { TenantsService, type NumberingView, type TenantView } from './tenants.service.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /** Any registered user can create a business; they become its Owner. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createTenantSchema)) body: CreateTenantInput,
  ): Promise<TenantView> {
    return this.tenants.create(body);
  }

  /** The caller's businesses (tenant switcher). */
  @Get()
  list(): Promise<MembershipView[]> {
    return this.tenants.listMine();
  }

  @Get(':id')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.view')
  get(): Promise<TenantView> {
    return this.tenants.get();
  }

  @Patch(':id')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.update')
  update(
    @Body(new ZodValidationPipe(updateTenantSchema)) body: UpdateTenantInput,
  ): Promise<TenantView> {
    return this.tenants.update(body);
  }

  @Post(':id/complete-onboarding')
  @HttpCode(200)
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.update')
  completeOnboarding(): Promise<TenantView> {
    return this.tenants.completeOnboarding();
  }

  @Get(':id/settings')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.view')
  getSettings(): Promise<Settings> {
    return this.tenants.getSettings();
  }

  @Patch(':id/settings')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.settings.update')
  updateSettings(
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<Settings> {
    return this.tenants.updateSettings(body);
  }

  @Get(':id/numbering')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.view')
  getNumbering(): Promise<NumberingView[]> {
    return this.tenants.getNumbering();
  }

  @Patch(':id/numbering')
  @TenantScoped({ param: 'id' })
  @RequirePermissions('tenant.settings.update')
  updateNumbering(
    @Body(new ZodValidationPipe(updateNumberingSchema)) body: UpdateNumberingInput,
  ): Promise<NumberingView[]> {
    return this.tenants.updateNumbering(body);
  }
}

import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { RequirePermissions, TenantScoped } from '../../common/context/decorators.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import type { MembershipView } from '../access/memberships.js';
import {
  createTenantSchema,
  updateTenantSchema,
  type CreateTenantInput,
  type UpdateTenantInput,
} from './tenants.dto.js';
import { TenantsService, type TenantView } from './tenants.service.js';

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
}

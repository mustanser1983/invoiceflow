import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/context/decorators.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  createTaxCodeSchema,
  updateTaxSettingsSchema,
  type CreateTaxCodeInput,
  type UpdateTaxSettingsInput,
} from './tax.dto.js';
import { TaxService, type TaxCodeView, type TaxSettingsView } from './tax.service.js';

/** Tenant-scoped through the X-Tenant-Id header. */
@Controller('tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('settings')
  @RequirePermissions('tax.view')
  getSettings(): Promise<TaxSettingsView> {
    return this.tax.getSettings();
  }

  @Patch('settings')
  @RequirePermissions('tax.settings.update')
  updateSettings(
    @Body(new ZodValidationPipe(updateTaxSettingsSchema)) body: UpdateTaxSettingsInput,
  ): Promise<TaxSettingsView> {
    return this.tax.updateSettings(body);
  }

  @Get('codes')
  @RequirePermissions('tax.view')
  listCodes(): Promise<TaxCodeView[]> {
    return this.tax.listCodes();
  }

  @Post('codes')
  @RequirePermissions('tax.settings.update')
  createCode(
    @Body(new ZodValidationPipe(createTaxCodeSchema)) body: CreateTaxCodeInput,
  ): Promise<TaxCodeView> {
    return this.tax.createCode(body);
  }
}

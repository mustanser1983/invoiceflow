import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  type Type,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/context/decorators.js';
import type { Paginated } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import {
  createPartySchema,
  duplicatesQuerySchema,
  listPartiesSchema,
  updatePartySchema,
  type CreatePartyInput,
  type DuplicatesQuery,
  type ListPartiesQuery,
  type UpdatePartyInput,
} from './parties.dto.js';
import {
  PartiesService,
  type DuplicateMatch,
  type PartyKind,
  type PartyView,
} from './parties.service.js';

/**
 * Builds the controller for /customers or /suppliers. Both are tenant-scoped through the
 * X-Tenant-Id header and check `<kind>.view|create|update` permissions.
 */
function partiesController(kind: PartyKind, path: string): Type<unknown> {
  @Controller(path)
  class PartiesController {
    private readonly parties: PartiesService;

    constructor(audit: AuditService) {
      this.parties = new PartiesService(kind, audit);
    }

    @Get()
    @RequirePermissions(`${kind}.view`)
    list(
      @Query(new ZodValidationPipe(listPartiesSchema)) query: ListPartiesQuery,
    ): Promise<Paginated<PartyView>> {
      return this.parties.list(query);
    }

    /** Declared before :id so "duplicates" isn't parsed as an id. */
    @Get('duplicates')
    @RequirePermissions(`${kind}.view`)
    duplicates(
      @Query(new ZodValidationPipe(duplicatesQuerySchema)) query: DuplicatesQuery,
    ): Promise<DuplicateMatch[]> {
      return this.parties.findDuplicates(query);
    }

    @Get(':id')
    @RequirePermissions(`${kind}.view`)
    get(@Param('id', new ParseUUIDPipe()) id: string): Promise<PartyView> {
      return this.parties.get(id);
    }

    @Post()
    @RequirePermissions(`${kind}.create`)
    create(
      @Body(new ZodValidationPipe(createPartySchema)) body: CreatePartyInput,
    ): Promise<PartyView> {
      return this.parties.create(body);
    }

    @Patch(':id')
    @RequirePermissions(`${kind}.update`)
    update(
      @Param('id', new ParseUUIDPipe()) id: string,
      @Body(new ZodValidationPipe(updatePartySchema)) body: UpdatePartyInput,
    ): Promise<PartyView> {
      return this.parties.update(id, body);
    }
  }
  Object.defineProperty(PartiesController, 'name', {
    value: `${kind[0]!.toUpperCase()}${kind.slice(1)}sController`,
  });
  return PartiesController;
}

export const CustomersController = partiesController('customer', 'customers');
export const SuppliersController = partiesController('supplier', 'suppliers');

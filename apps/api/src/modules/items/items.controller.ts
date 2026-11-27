import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/context/decorators.js';
import type { Paginated } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  createCategorySchema,
  createItemSchema,
  listCategoriesSchema,
  listItemsSchema,
  updateCategorySchema,
  updateItemSchema,
  type CreateCategoryInput,
  type CreateItemInput,
  type ListCategoriesQuery,
  type ListItemsQuery,
  type UpdateCategoryInput,
  type UpdateItemInput,
} from './items.dto.js';
import { ItemsService, type CategoryView, type ItemView } from './items.service.js';

/** Products and services, tenant-scoped through X-Tenant-Id. */
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions('item.view')
  list(
    @Query(new ZodValidationPipe(listItemsSchema)) query: ListItemsQuery,
  ): Promise<Paginated<ItemView>> {
    return this.items.list(query);
  }

  @Get(':id')
  @RequirePermissions('item.view')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ItemView> {
    return this.items.get(id);
  }

  @Post()
  @RequirePermissions('item.create')
  create(@Body(new ZodValidationPipe(createItemSchema)) body: CreateItemInput): Promise<ItemView> {
    return this.items.create(body);
  }

  @Patch(':id')
  @RequirePermissions('item.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemInput,
  ): Promise<ItemView> {
    return this.items.update(id, body);
  }
}

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions('expense.view')
  list(
    @Query(new ZodValidationPipe(listCategoriesSchema)) query: ListCategoriesQuery,
  ): Promise<CategoryView[]> {
    return this.items.listCategories(query);
  }

  @Post()
  @RequirePermissions('tenant.settings.update')
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryView> {
    return this.items.createCategory(body);
  }

  @Patch(':id')
  @RequirePermissions('tenant.settings.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryView> {
    return this.items.updateCategory(id, body);
  }
}

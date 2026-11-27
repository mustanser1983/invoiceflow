import { Module } from '@nestjs/common';
import { ExpenseCategoriesController, ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';

@Module({
  controllers: [ItemsController, ExpenseCategoriesController],
  providers: [ItemsService],
})
export class ItemsModule {}

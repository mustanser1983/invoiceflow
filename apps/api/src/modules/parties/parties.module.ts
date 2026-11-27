import { Module } from '@nestjs/common';
import { CustomersController, SuppliersController } from './parties.controller.js';

@Module({
  controllers: [CustomersController, SuppliersController],
})
export class PartiesModule {}

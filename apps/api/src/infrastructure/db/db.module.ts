import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service.js';
import { TransactionManager } from './transaction-manager.js';

@Global()
@Module({
  providers: [DbService, TransactionManager],
  exports: [DbService, TransactionManager],
})
export class DbModule {}

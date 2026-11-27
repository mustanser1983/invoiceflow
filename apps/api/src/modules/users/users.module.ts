import { Module } from '@nestjs/common';
import { InvitationsController, RolesController, UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, InvitationsController, RolesController],
  providers: [UsersService],
})
export class UsersModule {}

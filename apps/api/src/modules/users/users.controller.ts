import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermissions } from '../../common/context/decorators.js';
import { RateLimit } from '../../common/rate-limit.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import type { MembershipView } from '../access/memberships.js';
import {
  acceptInvitationSchema,
  inviteUserSchema,
  updateMemberSchema,
  type AcceptInvitationInput,
  type InviteUserInput,
  type UpdateMemberInput,
} from './users.dto.js';
import {
  UsersService,
  type InvitationView,
  type MemberView,
  type RoleView,
} from './users.service.js';

/** Members of the current business (X-Tenant-Id). */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.view')
  list(): Promise<MemberView[]> {
    return this.users.listMembers();
  }

  @Get('invitations')
  @RequirePermissions('user.view')
  listInvitations(): Promise<InvitationView[]> {
    return this.users.listInvitations();
  }

  @Post('invite')
  @RequirePermissions('user.invite')
  @RateLimit(30)
  invite(@Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput) {
    return this.users.invite(body);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(204)
  @RequirePermissions('user.invite')
  async revokeInvitation(
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ): Promise<void> {
    await this.users.revokeInvitation(invitationId);
  }

  @Patch(':userId')
  @RequirePermissions('user.update')
  update(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ): Promise<MemberView> {
    return this.users.updateMember(userId, body);
  }
}

/** Accepting is done by the invited person, before they belong to the business. */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly users: UsersService) {}

  @Post('accept')
  @HttpCode(200)
  @RateLimit(10)
  accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
  ): Promise<MembershipView[]> {
    return this.users.accept(body);
  }
}

@Controller()
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get('roles')
  @RequirePermissions('role.view')
  listRoles(): Promise<RoleView[]> {
    return this.users.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('role.view')
  listPermissions() {
    return this.users.listPermissions();
  }
}

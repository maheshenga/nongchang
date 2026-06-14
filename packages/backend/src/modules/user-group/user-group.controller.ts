import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  AuthUser, UserGroupInput, AssignUserGroupInput,
  userGroupInputSchema, assignUserGroupSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UserGroupService } from './user-group.service';

@Controller('user-groups')
@Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
export class UserGroupController {
  constructor(private svc: UserGroupService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(userGroupInputSchema)) dto: UserGroupInput) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userGroupInputSchema)) dto: UserGroupInput,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.svc.remove(user, id);
    return { ok: true as const };
  }

  @Put('assign')
  async assign(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(assignUserGroupSchema)) dto: AssignUserGroupInput) {
    await this.svc.assignUserGroup(user, dto);
    return { ok: true as const };
  }
}

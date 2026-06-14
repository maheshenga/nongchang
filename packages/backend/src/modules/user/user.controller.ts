import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CreateUserDto, createUserSchema, ReviewUserInput, reviewUserSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private svc: UserService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }

  @Get('pending') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  listPending(@CurrentUser() user: AuthUser) { return this.svc.listPending(user); }

  @Post(':id/review') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewUserSchema)) dto: ReviewUserInput) {
    return this.svc.review(user, id, dto);
  }
}

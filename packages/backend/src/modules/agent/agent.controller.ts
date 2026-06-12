import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CreateAgentDto, createAgentSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentService } from './agent.service';

@Controller('agents')
export class AgentController {
  constructor(private svc: AgentService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAgentSchema)) dto: CreateAgentDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN)
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }

  @Get('merchants') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  merchants(@CurrentUser() user: AuthUser) { return this.svc.listMerchants(user); }
}

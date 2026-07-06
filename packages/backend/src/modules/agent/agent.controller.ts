import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AuthUser, CreateAgentDto, createAgentSchema, UpdateAgentDto, updateAgentSchema,
  SetAgentStatusInput, setAgentStatusSchema, Role, ListQuery, listQuerySchema,
} from '@nongchang/shared';
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
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) { return this.svc.list(user, query); }

  @Get('merchants') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  merchants(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) { return this.svc.listMerchants(user, query); }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAgentSchema)) dto: UpdateAgentDto) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/status') @Roles(Role.SYSTEM_ADMIN)
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string,
    @Body(new ZodValidationPipe(setAgentStatusSchema)) dto: SetAgentStatusInput) {
    return this.svc.setStatus(user, id, dto.status);
  }
}

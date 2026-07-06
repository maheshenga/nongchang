import { Body, Controller, DefaultValuePipe, Get, Headers, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CreateTraceEventDto, createTraceEventSchema, listQuerySchema, ListQuery, Permission, Role } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TraceService } from './trace.service';

@Controller('trace')
export class TraceController {
  constructor(private svc: TraceService) {}

  @Post('codes/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  genCode(
    @CurrentUser() user: AuthUser,
    @Param('batchId') batchId: string,
    @Query('count', new DefaultValuePipe(1), ParseIntPipe) count: number,
    @Headers('idempotency-key') requestKey?: string,
  ) {
    return this.svc.generateCodes(user, batchId, count, requestKey);
  }

  @Post('events') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  addEvent(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTraceEventSchema)) dto: CreateTraceEventDto) {
    return this.svc.addEvent(user, dto);
  }

  @Get('codes/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.TRACE_VIEW)
  listCodes(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.listCodes(user, batchId, query);
  }

  @Get('events/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.TRACE_VIEW)
  listEvents(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.listEvents(user, batchId, query);
  }
}

import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CreateTraceEventDto, createTraceEventSchema, Role } from '@nongchang/shared';
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
  ) {
    return this.svc.generateCodes(user, batchId, count);
  }

  @Post('events') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  addEvent(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTraceEventSchema)) dto: CreateTraceEventDto) {
    return this.svc.addEvent(user, dto);
  }

  @Get('codes/:batchId') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  listCodes(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string) {
    return this.svc.listCodes(user, batchId);
  }

  @Get('events/:batchId')
  list(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string) {
    return this.svc.listEvents(user, batchId);
  }
}

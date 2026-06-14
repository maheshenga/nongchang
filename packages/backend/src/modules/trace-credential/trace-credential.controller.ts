import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CreateTraceCredentialInput, createTraceCredentialSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TraceCredentialService } from './trace-credential.service';

@Controller('trace/credentials')
export class TraceCredentialController {
  constructor(private svc: TraceCredentialService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('batchId') batchId: string) {
    return this.svc.list(user, batchId);
  }

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTraceCredentialSchema)) dto: CreateTraceCredentialInput) {
    return this.svc.create(user, dto);
  }

  @Delete(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}

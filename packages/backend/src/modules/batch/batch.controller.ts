import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CreateBatchDto, createBatchSchema, listQuerySchema, ListQuery, Permission, Role, UpdateBatchCostDto, updateBatchCostSchema, UpdateBatchStatusDto, updateBatchStatusSchema } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BatchService } from './batch.service';

@Controller('batches')
export class BatchController {
  constructor(private svc: BatchService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createBatchSchema)) dto: CreateBatchDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.list(user, query);
  }

  @Get('by-code/:code') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
  byCode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.findByTraceCode(user, code);
  }

  @Get(':id/lifecycle') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.BATCH_VIEW)
  lifecycle(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.lifecycle(user, id);
  }

  @Patch(':id/status') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchStatusSchema)) dto: UpdateBatchStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto.status);
  }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  updateCost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBatchCostSchema)) dto: UpdateBatchCostDto,
  ) {
    return this.svc.updateCost(user, id, dto);
  }

  @Delete(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('force') force?: string) {
    return this.svc.remove(user, id, force === 'true');
  }
}

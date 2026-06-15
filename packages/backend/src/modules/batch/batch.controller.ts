import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CreateBatchDto, createBatchSchema, Role, UpdateBatchCostDto, updateBatchCostSchema, UpdateBatchStatusDto, updateBatchStatusSchema } from '@nongchang/shared';
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

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }

  @Get('by-code/:code')
  byCode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.findByTraceCode(user, code);
  }

  @Get(':id/lifecycle')
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
}

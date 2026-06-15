import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CreateFarmRecordDto, createFarmRecordSchema, FarmRecordQueryDto, farmRecordQuerySchema, Role, UpdateFarmRecordStatusDto, updateFarmRecordStatusSchema } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FarmRecordService } from './farm-record.service';

@Controller('farm-records')
export class FarmRecordController {
  constructor(private svc: FarmRecordService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createFarmRecordSchema)) dto: CreateFarmRecordDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(farmRecordQuerySchema)) query: FarmRecordQueryDto,
  ) {
    return this.svc.list(user, query);
  }

  @Patch(':id/status') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFarmRecordStatusSchema)) dto: UpdateFarmRecordStatusDto,
  ) {
    return this.svc.updateStatus(user, id, dto);
  }
}

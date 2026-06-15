import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AuthUser, CreateCropPhenologyDto, createCropPhenologySchema,
  UpdateCropPhenologyDto, updateCropPhenologySchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PhenologyService } from './phenology.service';

@Controller('phenologies')
export class PhenologyController {
  constructor(private svc: PhenologyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  // 偏离预警:实际进度对比标准物候模型。放在 :id 之前避免路由冲突。
  @Get('deviations')
  deviations(@CurrentUser() user: AuthUser) {
    return this.svc.deviations(user);
  }

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCropPhenologySchema)) dto: CreateCropPhenologyDto) {
    return this.svc.create(user, dto);
  }

  @Patch(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateCropPhenologySchema)) dto: UpdateCropPhenologyDto) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}

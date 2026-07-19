import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  Role,
  updateTenantSettingsSchema,
  type AuthUser,
  type UpdateTenantSettingsInput,
} from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.getByTenantId(user.tenantId);
  }

  @Put()
  @Roles(Role.SYSTEM_ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) dto: UpdateTenantSettingsInput,
  ) {
    return this.service.update(user, dto);
  }
}

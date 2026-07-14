import { Controller, Get } from '@nestjs/common';
import { Role, type AuthUser } from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantReadinessService } from './tenant-readiness.service';

@Controller('readiness')
@Roles(Role.SYSTEM_ADMIN)
export class TenantReadinessController {
  constructor(private readonly readiness: TenantReadinessService) {}

  @Get('tenant')
  get(@CurrentUser() actor: AuthUser) {
    return this.readiness.get(actor);
  }
}

import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AntiFakeService } from './anti-fake.service';

@Controller('anti-fake')
export class AntiFakeController {
  constructor(private svc: AntiFakeService) {}

  @Get('scans')
  listScans(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.svc.listScans(user, n);
  }

  @Get('alerts')
  listAlerts(@CurrentUser() user: AuthUser) {
    return this.svc.listAlerts(user);
  }

  // 冻结/解冻防伪码属风控写操作:显式声明授权角色;服务层 ownedScopeWhere 再做 fail-closed 范围校验。
  @Post('codes/:code/freeze') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT)
  freeze(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.freeze(user, code);
  }

  @Post('codes/:code/unfreeze') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT)
  unfreeze(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.unfreeze(user, code);
  }
}

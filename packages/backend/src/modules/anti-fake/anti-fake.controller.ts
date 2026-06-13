import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '@nongchang/shared';
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

  @Post('codes/:code/freeze')
  freeze(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.freeze(user, code);
  }

  @Post('codes/:code/unfreeze')
  unfreeze(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.svc.unfreeze(user, code);
  }
}

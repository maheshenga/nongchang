import { Controller, Get, Res, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountDataService } from './account-data.service';

@Controller('auth/me')
export class AccountLifecycleController {
  constructor(private readonly accountData: AccountDataService) {}

  @Get('data')
  preview(@CurrentUser() actor: AuthUser) {
    return this.accountData.preview(actor);
  }

  @Get('data/export')
  async export(
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.accountData.export(actor);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Content-Length', String(file.body.byteLength));
    return new StreamableFile(file.body);
  }
}

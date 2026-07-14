import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { closeAccountSchema, type AuthUser, type CloseAccountInput } from '@nongchang/shared';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccountDataService } from './account-data.service';
import { AccountLifecycleService } from './account-lifecycle.service';

@Controller('auth/me')
export class AccountLifecycleController {
  constructor(
    private readonly accountData: AccountDataService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

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

  @Post('close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(closeAccountSchema)) input: CloseAccountInput,
  ): Promise<void> {
    await this.lifecycle.close(actor, input);
  }
}

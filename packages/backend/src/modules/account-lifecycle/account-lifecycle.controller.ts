import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { closeAccountSchema, type AuthUser, type CloseAccountInput } from '@nongchang/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AccountDataService } from './account-data.service';
import { AccountLifecycleService } from './account-lifecycle.service';

const accountDataExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional(),
}).strict();

type AccountDataExportQuery = z.infer<typeof accountDataExportQuerySchema>;

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
    @Query(new ZodValidationPipe(accountDataExportQuerySchema)) query: AccountDataExportQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const format = query.format ?? 'json';
    const file = await this.accountData.export(actor, format);
    response.setHeader(
      'Content-Type',
      format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    );
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

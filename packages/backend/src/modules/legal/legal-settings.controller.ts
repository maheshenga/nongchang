import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import {
  legalDocumentPayloadSchema,
  Role,
  type AuthUser,
  type LegalDocumentPayload,
} from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LegalService } from './legal.service';

@Controller('legal-settings')
@Roles(Role.SYSTEM_ADMIN)
export class LegalSettingsController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.legal.getSettings(user);
  }

  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(legalDocumentPayloadSchema)) input: LegalDocumentPayload,
  ) {
    return this.legal.saveDraft(user, input);
  }

  @Post('publish')
  publish(@CurrentUser() user: AuthUser) {
    return this.legal.publish(user);
  }
}

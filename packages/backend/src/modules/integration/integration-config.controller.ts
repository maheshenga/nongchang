import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  AuthUser, IntegrationProvider, WechatConfigInput, XfyunConfigInput,
  integrationProviderSchema, wechatConfigInputSchema, xfyunConfigInputSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IntegrationConfigService } from './integration-config.service';

@Controller('integration-configs')
@Roles(Role.SYSTEM_ADMIN)
export class IntegrationConfigController {
  constructor(private svc: IntegrationConfigService) {}

  @Get(':provider')
  get(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ZodValidationPipe(integrationProviderSchema)) provider: IntegrationProvider,
  ) {
    return this.svc.getView(user, provider);
  }

  @Put('wechat')
  upsertWechat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wechatConfigInputSchema)) dto: WechatConfigInput,
  ) {
    return this.svc.upsertWechat(user, dto);
  }

  @Put('xfyun')
  upsertXfyun(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(xfyunConfigInputSchema)) dto: XfyunConfigInput,
  ) {
    return this.svc.upsertXfyun(user, dto);
  }
}

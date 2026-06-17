import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  AuthUser, IntegrationProvider, WechatConfigInput, XfyunConfigInput, TiandituConfigInput,
  integrationProviderSchema, wechatConfigInputSchema, xfyunConfigInputSchema,
  tiandituConfigInputSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IntegrationConfigService } from './integration-config.service';

@Controller('integration-configs')
@Roles(Role.SYSTEM_ADMIN)
export class IntegrationConfigController {
  constructor(private svc: IntegrationConfigService) {}

  // 天地图 key 供前端加载底图脚本:所有已登录角色可读(商家在地块地图也用)。
  // 方法级 @Roles 覆盖类级,放开三角色。
  @Get('tianditu/public-key')
  @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT)
  async tiandituKey(@CurrentUser() user: AuthUser) {
    return { key: await this.svc.getEnabledTiandituKey(user.tenantId) };
  }

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

  @Put('tianditu')
  upsertTianditu(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tiandituConfigInputSchema)) dto: TiandituConfigInput,
  ) {
    return this.svc.upsertTianditu(user, dto);
  }
}

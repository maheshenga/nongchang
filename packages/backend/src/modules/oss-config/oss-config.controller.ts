import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { AuthUser, OssConfigInput, ossConfigSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OssConfigService } from './oss-config.service';

@Controller('oss-config')
@Roles(Role.SYSTEM_ADMIN)
export class OssConfigController {
  constructor(private svc: OssConfigService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.svc.get(user);
  }

  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(ossConfigSchema)) dto: OssConfigInput) {
    return this.svc.upsert(user, dto);
  }

  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.svc.test(user);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AuthUser, QuickTemplateInput, quickTemplateInputSchema, Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { QuickTemplateService } from './quick-template.service';

@Controller('quick-templates')
export class QuickTemplateController {
  constructor(private svc: QuickTemplateService) {}

  // 读:任何登录用户(小程序农户使用模板)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  // 写:仅管理员(web 后台管理)
  @Post()
  @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(quickTemplateInputSchema)) dto: QuickTemplateInput) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quickTemplateInputSchema)) dto: QuickTemplateInput,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.svc.remove(user, id);
    return { ok: true as const };
  }
}

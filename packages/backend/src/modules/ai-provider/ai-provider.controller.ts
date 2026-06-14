import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AuthUser,
  CreateAiProviderInput,
  UpdateAiProviderInput,
  createAiProviderSchema,
  updateAiProviderSchema,
  Role,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiProviderService } from './ai-provider.service';

@Controller('ai-providers')
@Roles(Role.SYSTEM_ADMIN)
export class AiProviderController {
  constructor(private svc: AiProviderService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAiProviderSchema)) dto: CreateAiProviderInput) {
    return this.svc.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAiProviderSchema)) dto: UpdateAiProviderInput,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }

  @Post(':id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.test(user, id);
  }
}

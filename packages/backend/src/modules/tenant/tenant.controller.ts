import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  AuthUser,
  CreateTenantDto,
  createTenantSchema,
  ListQuery,
  listQuerySchema,
  Role,
  SetTenantStatusInput,
  setTenantStatusSchema,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantService } from './tenant.service';

@Controller('tenants')
@Roles(Role.PLATFORM_ADMIN)
export class TenantController {
  constructor(private svc: TenantService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.list(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTenantSchema)) dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Post(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTenantStatusSchema)) dto: SetTenantStatusInput,
  ) {
    return this.svc.setStatus(user, id, dto.status);
  }
}

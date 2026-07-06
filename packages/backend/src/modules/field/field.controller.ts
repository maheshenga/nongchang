import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser, CreateFieldDto, createFieldSchema, listQuerySchema, ListQuery, Permission, Role } from '@nongchang/shared';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FieldService } from './field.service';

@Controller('fields')
export class FieldController {
  constructor(private svc: FieldService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createFieldSchema)) dto: CreateFieldDto) {
    return this.svc.create(user, dto);
  }

  @Get() @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN, Role.MERCHANT) @Permissions(Permission.FIELD_VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.list(user, query);
  }
}

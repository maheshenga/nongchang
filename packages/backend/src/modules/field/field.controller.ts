import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CreateFieldDto, createFieldSchema, Role } from '@nongchang/shared';
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

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }
}

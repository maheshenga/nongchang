import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthUser, CreateBatchDto, createBatchSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BatchService } from './batch.service';

@Controller('batches')
export class BatchController {
  constructor(private svc: BatchService) {}

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createBatchSchema)) dto: CreateBatchDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.svc.list(user); }
}

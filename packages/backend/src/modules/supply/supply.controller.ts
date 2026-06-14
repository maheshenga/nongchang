import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CreateSupplyInput, IssueSupplyInput, createSupplyInputSchema, issueSupplyInputSchema, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SupplyService } from './supply.service';

@Controller('supplies')
export class SupplyController {
  constructor(private svc: SupplyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Post() @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSupplyInputSchema)) dto: CreateSupplyInput) {
    return this.svc.create(user, dto);
  }

  @Post(':id/issue') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(issueSupplyInputSchema)) dto: IssueSupplyInput) {
    return this.svc.issue(user, id, dto);
  }

  @Delete(':id') @Roles(Role.SYSTEM_ADMIN, Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}

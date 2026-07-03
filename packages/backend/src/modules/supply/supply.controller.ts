import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser, CreateSupplyInput, IssueSupplyInput, createSupplyInputSchema, issueSupplyInputSchema, listQuerySchema, ListQuery, Role } from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SupplyService } from './supply.service';

@Controller('supplies')
export class SupplyController {
  constructor(private svc: SupplyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.list(user, query);
  }

  @Post() @Roles(Role.MERCHANT)
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSupplyInputSchema)) dto: CreateSupplyInput) {
    return this.svc.create(user, dto);
  }

  @Post(':id/issue') @Roles(Role.MERCHANT)
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(issueSupplyInputSchema)) dto: IssueSupplyInput) {
    return this.svc.issue(user, id, dto);
  }

  @Delete(':id') @Roles(Role.MERCHANT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}

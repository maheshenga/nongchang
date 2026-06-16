import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  AuthUser, Role, allocateSchema, AllocateInput, rechargeSchema, RechargeInput,
  ledgerQuerySchema, LedgerQuery,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.svc.summary(user);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser) {
    return this.svc.listAccounts(user);
  }

  @Get('ledger')
  ledger(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQuery) {
    return this.svc.ledger(user, query);
  }

  @Post('allocate') @Roles(Role.SYSTEM_ADMIN, Role.AGENT_ADMIN)
  allocate(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(allocateSchema)) dto: AllocateInput) {
    return this.svc.allocate(user, dto);
  }

  @Post('recharge') @Roles(Role.SYSTEM_ADMIN)
  recharge(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(rechargeSchema)) dto: RechargeInput) {
    return this.svc.recharge(user, dto);
  }
}

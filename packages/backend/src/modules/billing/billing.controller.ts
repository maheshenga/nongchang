import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  AuthUser, Role, allocateSchema, AllocateInput, rechargeSchema, RechargeInput,
  ledgerQuerySchema, LedgerQuery,
  createCreditPlanSchema, CreateCreditPlanInput, updateCreditPlanSchema, UpdateCreditPlanInput,
  createOrderSchema, CreateOrderInput, orderQuerySchema, OrderQuery,
  alipayConfigSchema, AlipayConfigInput, createPaymentSchema, CreatePaymentInput,
  listQuerySchema, ListQuery,
} from '@nongchang/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BillingService } from './billing.service';
import { AlipayService } from './alipay.service';

@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService, private alipay: AlipayService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.svc.summary(user);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.listAccounts(user, query);
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

  // ===== 售卖套餐 =====
  // 列表对所有登录角色开放(购买方需看上架套餐);写操作仅 SYSTEM_ADMIN(服务层再校验)。
  @Get('plans')
  listPlans(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.svc.listPlans(user, query);
  }

  @Post('plans') @Roles(Role.SYSTEM_ADMIN)
  createPlan(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCreditPlanSchema)) dto: CreateCreditPlanInput) {
    return this.svc.createPlan(user, dto);
  }

  @Patch('plans/:id') @Roles(Role.SYSTEM_ADMIN)
  updatePlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateCreditPlanSchema)) dto: UpdateCreditPlanInput) {
    return this.svc.updatePlan(user, id, dto);
  }

  @Delete('plans/:id') @Roles(Role.SYSTEM_ADMIN)
  removePlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.removePlan(user, id);
  }

  // ===== 自助购买订单(AGENT_ADMIN / MERCHANT) =====
  @Get('orders') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  listOrders(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(orderQuerySchema)) query: OrderQuery) {
    return this.svc.listOrders(user, query);
  }

  @Get('orders/:id') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  getOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getOrder(user, id);
  }

  @Post('orders') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  createOrder(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderInput) {
    return this.svc.createOrder(user, dto);
  }

  @Post('orders/:id/pay') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  payOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.payOrder(user, id);
  }

  @Post('orders/:id/cancel') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  cancelOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.cancelOrder(user, id);
  }

  // ===== 支付宝配置(SYSTEM_ADMIN) =====
  @Get('alipay/config') @Roles(Role.SYSTEM_ADMIN)
  getAlipayConfig(@CurrentUser() user: AuthUser) {
    return this.alipay.getConfig(user);
  }

  @Put('alipay/config') @Roles(Role.SYSTEM_ADMIN)
  saveAlipayConfig(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(alipayConfigSchema)) dto: AlipayConfigInput) {
    return this.alipay.upsertConfig(user, dto);
  }

  // ===== 发起支付(AGENT_ADMIN / MERCHANT) =====
  @Post('payments') @Roles(Role.AGENT_ADMIN, Role.MERCHANT)
  createPayment(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createPaymentSchema)) dto: CreatePaymentInput) {
    return this.alipay.createPayment(user, dto);
  }

  // ===== 支付宝异步回调(无 JWT,验签为唯一信任来源) =====
  @Public() @Post('alipay/notify')
  alipayNotify(@Body() body: Record<string, string>) {
    return this.alipay.handleNotify(body);
  }
}

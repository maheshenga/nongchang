import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './modules/agent/agent.module';
import { FieldModule } from './modules/field/field.module';
import { BatchModule } from './modules/batch/batch.module';
import { FarmRecordModule } from './modules/farm-record/farm-record.module';
import { TraceModule } from './modules/trace/trace.module';
import { UserModule } from './modules/user/user.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { PublicTraceModule } from './modules/public-trace/public-trace.module';
import { UploadModule } from './modules/upload/upload.module';
import { AntiFakeModule } from './modules/anti-fake/anti-fake.module';
import { SupplyModule } from './modules/supply/supply.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AiProviderModule } from './modules/ai-provider/ai-provider.module';
import { AiModule } from './modules/ai/ai.module';
import { OssConfigModule } from './modules/oss-config/oss-config.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { UserGroupModule } from './modules/user-group/user-group.module';
import { QuickTemplateModule } from './modules/quick-template/quick-template.module';
import { TraceCredentialModule } from './modules/trace-credential/trace-credential.module';
import { PhenologyModule } from './modules/phenology/phenology.module';
import { BillingModule } from './modules/billing/billing.module';
import { ScopeService } from './common/scope/scope.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    // ConfigModule MUST come before AuthModule so JwtStrategy/AuthService can
    // read JWT secrets from .env at runtime.
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // 全局限流:默认每 IP 60s 内最多 120 次请求,挡撞库/刷量/低成本 DoS。
    // 测试环境(NODE_ENV=test)放到极高阈值,避免 e2e 中密集请求误触限流导致脆弱失败。
    // 单端点更严的限制(如登录、公开扫码)由控制器上的 @Throttle 覆盖。
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'test' ? 100_000 : 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    AgentModule,
    FieldModule,
    BatchModule,
    FarmRecordModule,
    TraceModule,
    UserModule,
    TenantModule,
    PublicTraceModule,
    UploadModule,
    AntiFakeModule,
    SupplyModule,
    CryptoModule,
    AiProviderModule,
    AiModule,
    OssConfigModule,
    IntegrationModule,
    UserGroupModule,
    QuickTemplateModule,
    TraceCredentialModule,
    PhenologyModule,
    BillingModule,
  ],
  providers: [
    ScopeService,
    // ThrottlerGuard 在认证守卫之前执行,使匿名端点(登录/公开扫码)也受限流保护。
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

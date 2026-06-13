import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './modules/agent/agent.module';
import { FieldModule } from './modules/field/field.module';
import { BatchModule } from './modules/batch/batch.module';
import { FarmRecordModule } from './modules/farm-record/farm-record.module';
import { TraceModule } from './modules/trace/trace.module';
import { UserModule } from './modules/user/user.module';
import { PublicTraceModule } from './modules/public-trace/public-trace.module';
import { UploadModule } from './modules/upload/upload.module';
import { ScopeService } from './common/scope/scope.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    // ConfigModule MUST come before AuthModule so JwtStrategy/AuthService can
    // read JWT secrets from .env at runtime.
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
    AgentModule,
    FieldModule,
    BatchModule,
    FarmRecordModule,
    TraceModule,
    UserModule,
    PublicTraceModule,
    UploadModule,
  ],
  providers: [
    ScopeService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

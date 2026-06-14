import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { IntegrationModule } from '../modules/integration/integration.module';
import { UserGroupModule } from '../modules/user-group/user-group.module';

@Module({
  imports: [JwtModule.register({}), IntegrationModule, UserGroupModule],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

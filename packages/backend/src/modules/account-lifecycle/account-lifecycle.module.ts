import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { LegalModule } from '../legal/legal.module';
import { AccountDataService } from './account-data.service';
import { AccountLifecycleController } from './account-lifecycle.controller';
import { AccountLifecycleService } from './account-lifecycle.service';

@Module({
  imports: [AuthModule, LegalModule],
  controllers: [AccountLifecycleController],
  providers: [AccountDataService, AccountLifecycleService],
})
export class AccountLifecycleModule {}

import { Module } from '@nestjs/common';
import { LegalModule } from '../legal/legal.module';
import { AccountDataService } from './account-data.service';
import { AccountLifecycleController } from './account-lifecycle.controller';

@Module({
  imports: [LegalModule],
  controllers: [AccountLifecycleController],
  providers: [AccountDataService],
})
export class AccountLifecycleModule {}

import { Module } from '@nestjs/common';
import { UserGroupService } from './user-group.service';
import { UserGroupController } from './user-group.controller';
import { RuntimeStateModule } from '../../common/runtime/runtime-state.module';

@Module({
  imports: [RuntimeStateModule],
  providers: [UserGroupService],
  controllers: [UserGroupController],
  exports: [UserGroupService],
})
export class UserGroupModule {}

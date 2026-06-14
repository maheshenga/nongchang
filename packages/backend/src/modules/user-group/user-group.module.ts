import { Module } from '@nestjs/common';
import { UserGroupService } from './user-group.service';
import { UserGroupController } from './user-group.controller';

@Module({
  providers: [UserGroupService],
  controllers: [UserGroupController],
  exports: [UserGroupService],
})
export class UserGroupModule {}

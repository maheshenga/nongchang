import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ScopeService } from '../../common/scope/scope.service';
import { UserGroupModule } from '../user-group/user-group.module';

@Module({
  imports: [UserGroupModule],
  providers: [UserService, ScopeService],
  controllers: [UserController],
})
export class UserModule {}

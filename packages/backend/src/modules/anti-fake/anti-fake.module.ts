import { Module } from '@nestjs/common';
import { ScopeService } from '../../common/scope/scope.service';
import { AntiFakeService } from './anti-fake.service';
import { AntiFakeController } from './anti-fake.controller';

@Module({ providers: [AntiFakeService, ScopeService], controllers: [AntiFakeController] })
export class AntiFakeModule {}

import { Module } from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [BatchService, ScopeService], controllers: [BatchController] })
export class BatchModule {}

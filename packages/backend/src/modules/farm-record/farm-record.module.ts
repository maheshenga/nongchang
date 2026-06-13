import { Module } from '@nestjs/common';
import { FarmRecordService } from './farm-record.service';
import { FarmRecordController } from './farm-record.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [FarmRecordService, ScopeService], controllers: [FarmRecordController] })
export class FarmRecordModule {}

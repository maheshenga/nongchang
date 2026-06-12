import { Module } from '@nestjs/common';
import { TraceService } from './trace.service';
import { TraceController } from './trace.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [TraceService, ScopeService], controllers: [TraceController] })
export class TraceModule {}

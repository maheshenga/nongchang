import { Module } from '@nestjs/common';
import { ScopeService } from '../../common/scope/scope.service';
import { SupplyService } from './supply.service';
import { SupplyController } from './supply.controller';

@Module({ providers: [SupplyService, ScopeService], controllers: [SupplyController] })
export class SupplyModule {}

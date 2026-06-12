import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [AgentService, ScopeService], controllers: [AgentController] })
export class AgentModule {}

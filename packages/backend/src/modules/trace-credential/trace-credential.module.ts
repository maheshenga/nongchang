import { Module } from '@nestjs/common';
import { ScopeService } from '../../common/scope/scope.service';
import { TraceCredentialService } from './trace-credential.service';
import { TraceCredentialController } from './trace-credential.controller';

@Module({ providers: [TraceCredentialService, ScopeService], controllers: [TraceCredentialController] })
export class TraceCredentialModule {}

import { Module } from '@nestjs/common';
import { PhenologyService } from './phenology.service';
import { PhenologyController } from './phenology.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [PhenologyService, ScopeService], controllers: [PhenologyController] })
export class PhenologyModule {}

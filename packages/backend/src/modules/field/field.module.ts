import { Module } from '@nestjs/common';
import { FieldService } from './field.service';
import { FieldController } from './field.controller';
import { ScopeService } from '../../common/scope/scope.service';

@Module({ providers: [FieldService, ScopeService], controllers: [FieldController] })
export class FieldModule {}

import { Module } from '@nestjs/common';
import { PublicTraceService } from './public-trace.service';
import { PublicTraceController } from './public-trace.controller';

@Module({ providers: [PublicTraceService], controllers: [PublicTraceController] })
export class PublicTraceModule {}

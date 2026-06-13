import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTraceService } from './public-trace.service';

@Controller('public/trace')
export class PublicTraceController {
  constructor(private svc: PublicTraceService) {}

  @Public()
  @Get(':code')
  get(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }
}

import { Controller, Get, Param, Req } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTraceService } from './public-trace.service';

@Controller('public/trace')
export class PublicTraceController {
  constructor(private svc: PublicTraceService) {}

  @Public()
  @Get(':code')
  get(@Param('code') code: string, @Req() req: IncomingMessage) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]) ?? req.socket.remoteAddress ?? 'unknown';
    const ua = req.headers['user-agent'] ?? null;
    return this.svc.getByCode(code, { ip: ip.trim(), userAgent: ua });
  }
}

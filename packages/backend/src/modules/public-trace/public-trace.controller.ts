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
    // 注意:XFF 由客户端可控,此处取最左段仅作弱信号。IP 不可信,异常检测仅供参考,
    // 不作为可信证据(待部署拓扑确定后改用可信代理跳/trust proxy)。见后续硬化项。
    const fwd = req.headers['x-forwarded-for'];
    const fwdFirst = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0];
    const rawIp = fwdFirst ?? req.socket.remoteAddress ?? 'unknown';
    const ua = req.headers['user-agent'] ?? null;
    // 落库前截断:该端点 @Public 无鉴权,header 由客户端任意构造,防止超长写入膨胀存储。
    return this.svc.getByCode(code, { ip: rawIp.trim().slice(0, 64), userAgent: ua?.slice(0, 512) ?? null });
  }
}

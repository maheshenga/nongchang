import { Controller, Get, Param, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { IncomingMessage } from 'http';
import { Public } from '../../common/decorators/public.decorator';
import { PublicTraceService } from './public-trace.service';
import { resolveClientIp } from './client-ip';

// 可信反代跳数:宝塔单层 Nginx 默认 1。生产按实际拓扑用 env TRUST_PROXY_HOPS 覆盖。
const TRUST_PROXY_HOPS = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10) || 0;

// 公开扫码端点无鉴权且每次扫码写库 + scanCount++,限流挡刷量(防伪告警依赖扫码 IP/次数,
// 刷量会污染告警)。每 IP 60s 内最多 30 次。测试环境放高阈值避免 e2e 误触。
const SCAN_LIMIT = process.env.NODE_ENV === 'test' ? 100_000 : 30;

@Controller('public/trace')
export class PublicTraceController {
  constructor(private svc: PublicTraceService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: SCAN_LIMIT } })
  @Get(':code')
  get(@Param('code') code: string, @Req() req: IncomingMessage) {
    // XFF 由客户端可控,直接取最左段会被伪造。按可信反代跳数从 XFF 右端取真实客户端 IP。
    const rawIp = resolveClientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, TRUST_PROXY_HOPS);
    const ua = req.headers['user-agent'] ?? null;
    // 落库前截断:该端点 @Public 无鉴权,header 由客户端任意构造,防止超长写入膨胀存储。
    return this.svc.getByCode(code, { ip: rawIp.trim().slice(0, 64), userAgent: ua?.slice(0, 512) ?? null });
  }
}

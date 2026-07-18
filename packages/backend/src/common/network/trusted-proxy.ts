import type { INestApplication } from '@nestjs/common';

const MAX_TRUST_PROXY_HOPS = 5;

export function parseTrustProxyHops(env: NodeJS.ProcessEnv): number {
  const raw = env.TRUST_PROXY_HOPS ?? '1';
  if (!/^\d+$/.test(raw)) {
    throw new Error('[启动校验] TRUST_PROXY_HOPS 必须是 0 到 5 的整数');
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error('[启动校验] TRUST_PROXY_HOPS 必须是 0 到 5 的整数');
  }
  return hops;
}

export function configureTrustedProxy(app: INestApplication, hops: number): void {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}

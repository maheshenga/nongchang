const LOOPBACK_HOST = '127.0.0.1' as const;

export function readListenHost(env: { HOST?: string }): typeof LOOPBACK_HOST {
  const configured = env.HOST?.trim() || LOOPBACK_HOST;
  if (configured !== LOOPBACK_HOST) {
    throw new Error('[启动校验] HOST must be 127.0.0.1; public or wildcard application binding is forbidden');
  }
  return LOOPBACK_HOST;
}

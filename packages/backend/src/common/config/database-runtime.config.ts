export interface DatabaseRuntimeConfig {
  poolMax: number;
  poolTimeoutSeconds: number;
  statementTimeoutMs: number;
}

function integerInRange(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[启动校验] ${name} 必须是 ${min} 到 ${max} 的整数`);
  }
  return value;
}

export function readDatabaseRuntimeConfig(env: NodeJS.ProcessEnv = process.env): DatabaseRuntimeConfig {
  return {
    poolMax: integerInRange(env, 'DATABASE_POOL_MAX', 20, 1, 100),
    poolTimeoutSeconds: integerInRange(env, 'DATABASE_POOL_TIMEOUT_SECONDS', 10, 1, 120),
    statementTimeoutMs: integerInRange(env, 'DATABASE_STATEMENT_TIMEOUT_MS', 30_000, 100, 300_000),
  };
}

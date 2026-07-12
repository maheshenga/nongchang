/**
 * 启动期环境变量校验:对安全攸关的密钥做 fail-closed 检查,
 * 缺失/过短/沿用开发占位值时直接抛错,避免带病上线。
 * 在 NestFactory.create 之前调用(此时各模块尚未实例化)。
 */

import { readUploadPendingMaxAgeMinutes, readUploadQuotaLimits } from '../../modules/upload/upload-quota.config';
import { parseTrustProxyHops } from '../network/trusted-proxy';

// 已知的开发占位值,生产环境绝不允许沿用。
const WEAK_SECRETS = new Set([
  'dev-access-secret-change-me',
  'dev-refresh-secret-change-me',
  'change-me',
  'secret',
  'test',
]);

function requireStrongSecret(name: string, isProd: boolean): void {
  const val = process.env[name];
  if (!val) {
    throw new Error(`[启动校验] 缺少环境变量 ${name},无法签发/校验 token`);
  }
  if (isProd) {
    if (WEAK_SECRETS.has(val)) {
      throw new Error(`[启动校验] ${name} 仍为开发占位值,生产环境必须替换为强随机值(如 openssl rand -hex 32)`);
    }
    if (val.length < 32) {
      throw new Error(`[启动校验] ${name} 长度不足 32,生产环境密钥强度不够`);
    }
  }
}

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';

  if (!process.env.DATABASE_URL) {
    throw new Error('[启动校验] 缺少 DATABASE_URL');
  }

  requireStrongSecret('JWT_SECRET', isProd);
  requireStrongSecret('JWT_REFRESH_SECRET', isProd);

  // APP_ENCRYPTION_KEY 由 EncryptionService 自身校验格式;此处仅确保存在,提前 fail-fast。
  if (!process.env.APP_ENCRYPTION_KEY) {
    throw new Error('[启动校验] 缺少 APP_ENCRYPTION_KEY(用于加密第三方凭据)');
  }

  // 免支付兜底入账(ALLOW_MANUAL_PAY=true)会绕过真实支付渠道直接给账户充值,
  // 仅供本地联调。生产环境一旦误置为 true,任意 agent_admin/merchant 即可给自己白送额度,
  // 故在此把"生产禁用"从注释约定升级为启动期硬熔断。
  if (isProd && process.env.ALLOW_MANUAL_PAY === 'true') {
    throw new Error('[启动校验] 生产环境禁止开启 ALLOW_MANUAL_PAY(免支付兜底入账会绕过真实支付),请置空或设为 false');
  }

  parseTrustProxyHops(process.env);
  readUploadQuotaLimits(process.env);
  readUploadPendingMaxAgeMinutes(process.env);
}

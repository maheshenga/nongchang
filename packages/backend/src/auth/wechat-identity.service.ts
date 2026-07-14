import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationConfigService } from '../modules/integration/integration-config.service';

const WX_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const WX_TIMEOUT_MS = 8_000;

interface WxSessionResponse {
  openid?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class WechatIdentityService {
  constructor(private readonly integrations: IntegrationConfigService) {}

  async resolve(appId: string, code: string): Promise<{ tenantId: string; openid: string }> {
    const lookup = await this.integrations.findTenantByWechatAppId(appId);
    if (!lookup) {
      throw new UnauthorizedException('该小程序未配置微信登录');
    }
    const openid = await exchangeCode(appId, lookup.secret, code);
    return { tenantId: lookup.tenantId, openid };
  }
}

async function exchangeCode(appId: string, secret: string, code: string): Promise<string> {
  const url = `${WX_SESSION_URL}?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WX_TIMEOUT_MS);
  let data: WxSessionResponse;
  try {
    const response = await fetch(url, { signal: controller.signal });
    data = (await response.json()) as WxSessionResponse;
  } catch {
    throw new UnauthorizedException('微信登录服务不可用');
  } finally {
    clearTimeout(timer);
  }
  if (data.errcode || !data.openid) {
    throw new UnauthorizedException('微信登录失败');
  }
  return data.openid;
}

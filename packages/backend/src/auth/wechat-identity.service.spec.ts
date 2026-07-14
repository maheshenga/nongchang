import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WechatIdentityService } from './wechat-identity.service';

describe('WechatIdentityService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('resolves the configured tenant and WeChat OpenID', async () => {
    const integrations = {
      findTenantByWechatAppId: vi.fn().mockResolvedValue({ tenantId: 't1', secret: 'secret-1' }),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ openid: 'openid-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new WechatIdentityService(integrations as never);

    await expect(service.resolve('wx app', 'fresh/code')).resolves.toEqual({
      tenantId: 't1',
      openid: 'openid-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/sns/jscode2session?appid=wx%20app&secret=secret-1&js_code=fresh%2Fcode&grant_type=authorization_code',
      { signal: expect.any(AbortSignal) },
    );
  });

  it('rejects an AppID that has no enabled tenant configuration', async () => {
    const integrations = {
      findTenantByWechatAppId: vi.fn().mockResolvedValue(null),
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new WechatIdentityService(integrations as never);

    await expect(service.resolve('wx-missing', 'code'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps WeChat API failures without exposing provider details', async () => {
    const integrations = {
      findTenantByWechatAppId: vi.fn().mockResolvedValue({ tenantId: 't1', secret: 'secret-1' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ errcode: 40029, errmsg: 'invalid code' }),
    }));
    const service = new WechatIdentityService(integrations as never);

    await expect(service.resolve('wx-app', 'bad-code')).rejects.toMatchObject({
      message: '微信登录失败',
    } satisfies Partial<UnauthorizedException>);
  });

  it('aborts an unavailable WeChat exchange after eight seconds', async () => {
    vi.useFakeTimers();
    const integrations = {
      findTenantByWechatAppId: vi.fn().mockResolvedValue({ tenantId: 't1', secret: 'secret-1' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((
      _url: string,
      options: { signal: AbortSignal },
    ) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const service = new WechatIdentityService(integrations as never);
    const assertion = expect(service.resolve('wx-app', 'code')).rejects.toMatchObject({
      message: '微信登录服务不可用',
    } satisfies Partial<UnauthorizedException>);

    await vi.advanceTimersByTimeAsync(7_999);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
});

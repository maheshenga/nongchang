import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';

const user = { userId: 'u1', tenantId: 't1', role: 'merchant' } as AuthUser;
function providerSvc(enabled: any) { return { getEnabled: async () => enabled } as any; }
function integrationSvc(xfyun: any = null) { return { getEnabledXfyun: async () => xfyun } as any; }
const noProv = providerSvc(null);

describe('AiService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('无 provider 抛业务错误', async () => {
    const svc = new AiService(providerSvc(null), integrationSvc());
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chat 返回模型回答', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc());
    const r = await svc.chat(user, 'hi');
    expect(r.answer).toBe('你好');
  });

  it('diagnose 无 visionModel 抛错', async () => {
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc());
    await expect(svc.diagnose(user, { imageUrl: 'https://x.com/a.jpg' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('diagnose 用 visionModel 返回结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '叶片缺氮' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: 'vm' }), integrationSvc());
    const r = await svc.diagnose(user, { imageBase64: 'AAAA' });
    expect(r.result).toBe('叶片缺氮');
  });

  it('调用返回非 2xx 时抛 BadGatewayException 且不泄露 apiKey', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-secret-1', textModel: 'm', visionModel: null }), integrationSvc());
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadGatewayException);
    await expect(svc.chat(user, 'hi')).rejects.not.toThrow(/sk-secret-1/);
  });

  it('网络错误（fetch reject）时抛 BadGatewayException', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-secret-1', textModel: 'm', visionModel: null }), integrationSvc());
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('transcribe 未配置讯飞抛业务错误', async () => {
    const svc = new AiService(noProv, integrationSvc(null));
    await expect(svc.transcribe(user, Buffer.from('abc'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transcribe 空音频抛业务错误', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }));
    await expect(svc.transcribe(user, Buffer.alloc(0))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transcribe 经 WS 拼接识别文字', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }));
    const factory = makeWsFactory([
      { code: 0, data: { status: 1, result: { ws: [{ cw: [{ w: '浇' }] }, { cw: [{ w: '水' }] }] } } },
      { code: 0, data: { status: 2, result: { ws: [{ cw: [{ w: '完成' }] }] } } },
    ]);
    const r = await svc.transcribe(user, Buffer.from('1234'), factory);
    expect(r.text).toBe('浇水完成');
  });

  it('transcribe 讯飞错误码时降级为 BadGatewayException', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }));
    const factory = makeWsFactory([{ code: 10001, message: 'bad' }]);
    await expect(svc.transcribe(user, Buffer.from('1234'), factory)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

// 构造一个在 open 后依次回放给定消息帧的 mock WebSocket 工厂
function makeWsFactory(frames: unknown[]) {
  return (_url: string) => {
    const handlers: Record<string, ((arg?: any) => void)[]> = {};
    const ws = {
      on(event: string, cb: (arg?: any) => void) {
        (handlers[event] ??= []).push(cb);
      },
      send() { /* ignore frames sent to xfyun */ },
      close() { /* noop */ },
    };
    // 异步触发 open → 回放消息
    queueMicrotask(() => {
      handlers.open?.forEach((cb) => cb());
      for (const f of frames) handlers.message?.forEach((cb) => cb(JSON.stringify(f)));
    });
    return ws as any;
  };
}

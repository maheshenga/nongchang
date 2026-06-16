import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';
import { AI_WEIGHT } from '../billing/billing.constants';

const user = { userId: 'u1', tenantId: 't1', role: 'merchant' } as AuthUser;
function providerSvc(enabled: any) { return { getEnabled: async () => enabled } as any; }
function integrationSvc(xfyun: any = null) { return { getEnabledXfyun: async () => xfyun } as any; }
function billingSvc() { return { consume: vi.fn().mockResolvedValue({ balanceAfter: 0 }) } as any; }
const noProv = providerSvc(null);

describe('AiService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('无 provider 抛业务错误', async () => {
    const svc = new AiService(providerSvc(null), integrationSvc(), billingSvc(), {} as any, {} as any);
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chat 返回模型回答', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc(), billingSvc(), {} as any, {} as any);
    const r = await svc.chat(user, 'hi');
    expect(r.answer).toBe('你好');
  });

  it('diagnose 无 visionModel 抛错', async () => {
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc(), billingSvc(), {} as any, {} as any);
    await expect(svc.diagnose(user, { imageUrl: 'https://x.com/a.jpg' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('diagnose 用 visionModel 返回结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '叶片缺氮' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: 'vm' }), integrationSvc(), billingSvc(), {} as any, {} as any);
    const r = await svc.diagnose(user, { imageBase64: 'AAAA' });
    expect(r.result).toBe('叶片缺氮');
  });

  it('调用返回非 2xx 时抛 BadGatewayException 且不泄露 apiKey', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-secret-1', textModel: 'm', visionModel: null }), integrationSvc(), billingSvc(), {} as any, {} as any);
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadGatewayException);
    await expect(svc.chat(user, 'hi')).rejects.not.toThrow(/sk-secret-1/);
  });

  it('网络错误（fetch reject）时抛 BadGatewayException', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-secret-1', textModel: 'm', visionModel: null }), integrationSvc(), billingSvc(), {} as any, {} as any);
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('transcribe 未配置讯飞抛业务错误', async () => {
    const svc = new AiService(noProv, integrationSvc(null), billingSvc(), {} as any, {} as any);
    await expect(svc.transcribe(user, Buffer.from('abc'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transcribe 空音频抛业务错误', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billingSvc(), {} as any, {} as any);
    await expect(svc.transcribe(user, Buffer.alloc(0))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transcribe 经 WS 拼接识别文字', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billingSvc(), {} as any, {} as any);
    const factory = makeWsFactory([
      { code: 0, data: { status: 1, result: { ws: [{ cw: [{ w: '浇' }] }, { cw: [{ w: '水' }] }] } } },
      { code: 0, data: { status: 2, result: { ws: [{ cw: [{ w: '完成' }] }] } } },
    ]);
    const r = await svc.transcribe(user, Buffer.from('1234'), factory);
    expect(r.text).toBe('浇水完成');
  });

  it('transcribe 讯飞错误码时降级为 BadGatewayException', async () => {
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billingSvc(), {} as any, {} as any);
    const factory = makeWsFactory([{ code: 10001, message: 'bad' }]);
    await expect(svc.transcribe(user, Buffer.from('1234'), factory)).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('AiService 扣费插桩', () => {
  it('chat 成功后扣 AI 1', async () => {
    const consume = vi.fn().mockResolvedValue({ balanceAfter: 9 });
    const billing: any = { consume };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '答' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);
    const res = await svc.chat(user, '你好');
    expect(res.answer).toBe('答');
    expect(consume).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, { refType: 'ai.chat' });
  });
  it('chat 外部失败则不扣费', async () => {
    const consume = vi.fn();
    const billing: any = { consume };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);
    await expect(svc.chat(user, '你好')).rejects.toBeTruthy();
    expect(consume).not.toHaveBeenCalled();
  });
});

describe('AiService.advice', () => {
  it('拼接批次+农事记录上下文后调用 chat 并扣费', async () => {
    const consume = vi.fn().mockResolvedValue({ balanceAfter: 9 });
    const prisma: any = {
      batch: { findFirst: async () => ({ id: 'b1', cropName: '白芍', status: 'Growing', plantDate: new Date('2026-01-01') }) },
      farmRecord: { findMany: async () => [{ action: '浇水' }] },
      cropPhenology: { findMany: async () => [{ expectedDays: 30 }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { assertInScope: async () => {}, ownedScopeWhere: async () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, { consume } as any, prisma, scope);
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '建议浇水' } }] }) });
    const res = await svc.advice(user, { batchId: 'b1' });
    expect(res.answer).toContain('建议');
    expect(consume).toHaveBeenCalledWith(user, 'AI', 1, { refType: 'ai.advice', refId: 'b1' });
  });
});

describe('AiService.ask', () => {
  it('拼接可见批次上下文后调用 chat 并扣费', async () => {
    const consume = vi.fn().mockResolvedValue({ balanceAfter: 9 });
    const prisma: any = {
      batch: { findMany: async () => [{ batchNo: 'B1', cropName: '白芍', status: 'Growing', plantDate: new Date('2026-01-01') }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { ownedScopeWhere: async () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, { consume } as any, prisma, scope);
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '已为你汇总' } }] }) });
    const res = await svc.ask(user, { question: '当前有哪些批次' });
    expect(res.answer).toContain('汇总');
    expect(consume).toHaveBeenCalledWith(user, 'AI', 1, { refType: 'ai.ask' });
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

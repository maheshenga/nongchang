import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';
import { AI_WEIGHT } from '../billing/billing.constants';

const user = { userId: 'u1', tenantId: 't1', role: 'merchant' } as AuthUser;
function providerSvc(enabled: any) { return { getEnabled: async () => enabled } as any; }
function integrationSvc(xfyun: any = null) { return { getEnabledXfyun: async () => xfyun } as any; }
function billingSvc() {
  const billing = {
    reserve: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    confirmReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    releaseReservation: vi.fn().mockResolvedValue({ reservationId: 'res1', balanceAfter: 0 }),
    execute: vi.fn(),
  } as any;
  billing.execute.mockImplementation(async (input: any, providerCall: () => Promise<unknown>) => {
    await billing.reserve(input.user, 'AI', input.amount, input.ref);
    let value: unknown;
    try {
      value = await providerCall();
    } catch (error) {
      try {
        await billing.releaseReservation(input.user, 'AI', input.amount, input.ref);
      } catch {
        // Preserve the provider error in this test double, matching the coordinator contract.
      }
      throw error;
    }
    await billing.confirmReservation(input.user, 'AI', input.ref);
    return value;
  });
  return billing;
}
const noProv = providerSvc(null);
const keyPattern = (kind: string) => new RegExp(`^${kind.replace('.', '\\.')}:t1:u1:[a-f0-9]{16}$`);

describe('AiService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('无 provider 抛业务错误', async () => {
    const billing = billingSvc();
    const svc = new AiService(providerSvc(null), integrationSvc(), billing, {} as any, {} as any);
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.reserve).not.toHaveBeenCalled();
  });

  it('chat 返回模型回答', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc(), billingSvc(), {} as any, {} as any);
    const r = await svc.chat(user, 'hi');
    expect(r.answer).toBe('你好');
  });

  it('diagnose 无 visionModel 抛错', async () => {
    const billing = billingSvc();
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);
    await expect(svc.diagnose(user, { imageUrl: 'https://x.com/a.jpg' })).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.reserve).not.toHaveBeenCalled();
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
    const billing = billingSvc();
    const svc = new AiService(noProv, integrationSvc(null), billing, {} as any, {} as any);
    await expect(svc.transcribe(user, Buffer.from('abc'))).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.reserve).not.toHaveBeenCalled();
  });

  it('transcribe 空音频抛业务错误', async () => {
    const billing = billingSvc();
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
    await expect(svc.transcribe(user, Buffer.alloc(0))).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.reserve).not.toHaveBeenCalled();
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

describe('AiService billing reservation', () => {
  it('scopes a supplied client key by operation, tenant, and user', async () => {
    const billing = billingSvc();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) })));
    const svc = new AiService(providerSvc({ id: 'provider-1', baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await svc.chat(user, 'hello', 'client-action-key-0001');

    expect(billing.execute).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'ai.chat:t1:u1:client-action-key-0001',
      ref: expect.objectContaining({ idempotencyKey: 'ai.chat:t1:u1:client-action-key-0001' }),
    }), expect.any(Function));
  });

  it('chat success reserves and confirms AI 1', async () => {
    const billing = billingSvc();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) })));
    const svc = new AiService(providerSvc({ id: 'provider-1', baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    const res = await svc.chat(user, 'hello');

    expect(res.answer).toBe('answer');
    expect(billing.execute).toHaveBeenCalledWith(expect.objectContaining({
      user,
      providerId: 'provider-1',
      kind: 'ai.chat',
      amount: AI_WEIGHT.chat,
      operationKey: expect.stringMatching(keyPattern('ai.chat')),
    }), expect.any(Function));
    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
      refType: 'ai.chat',
      idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
    }));
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
      refType: 'ai.chat',
      idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
    }));
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('chat repeats use different reservation idempotency keys for the same payload', async () => {
    const billing = billingSvc();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await svc.chat(user, 'same-payload');
    await svc.chat(user, 'same-payload');

    expect(billing.reserve.mock.calls[0][3].idempotencyKey).not.toBe(billing.reserve.mock.calls[1][3].idempotencyKey);
    expect(billing.confirmReservation.mock.calls[0][2].idempotencyKey).not.toBe(billing.confirmReservation.mock.calls[1][2].idempotencyKey);
  });

  it('reserve failure does not start the external AI call or release', async () => {
    const billing = billingSvc();
    billing.reserve.mockRejectedValueOnce(new Error('insufficient'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await expect(svc.chat(user, 'hello')).rejects.toThrow('insufficient');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(billing.releaseReservation).not.toHaveBeenCalled();
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('chat releases the reservation when the external provider fails', async () => {
    const billing = billingSvc();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await expect(svc.chat(user, 'hello')).rejects.toBeTruthy();

    expect(billing.reserve).toHaveBeenCalledTimes(1);
    expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
      refType: 'ai.chat',
      idempotencyKey: expect.stringMatching(keyPattern('ai.chat')),
    }));
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('chat keeps the provider error when reservation release fails', async () => {
    const billing = billingSvc();
    billing.releaseReservation.mockRejectedValueOnce(new Error('release down'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await expect(svc.chat(user, 'hello')).rejects.toBeInstanceOf(BadGatewayException);

    expect(billing.releaseReservation).toHaveBeenCalledTimes(1);
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('chat does not release when provider succeeds but confirm fails', async () => {
    const billing = billingSvc();
    billing.confirmReservation.mockRejectedValueOnce(new Error('confirm down'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'answer' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: null }), integrationSvc(), billing, {} as any, {} as any);

    await expect(svc.chat(user, 'hello')).rejects.toThrow('confirm down');

    expect(billing.reserve).toHaveBeenCalledTimes(1);
    expect(billing.confirmReservation).toHaveBeenCalledTimes(1);
    expect(billing.releaseReservation).not.toHaveBeenCalled();
  });

  it('diagnose reservation ref includes a stable idempotency key', async () => {
    const billing = billingSvc();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'k', textModel: 'm', visionModel: 'vm' }), integrationSvc(), billing, {} as any, {} as any);

    await svc.diagnose(user, { imageBase64: 'AAAA', note: 'leaf' });

    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.diagnose, expect.objectContaining({
      refType: 'ai.diagnose',
      idempotencyKey: expect.stringMatching(keyPattern('ai.diagnose')),
    }));
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
      refType: 'ai.diagnose',
      idempotencyKey: expect.stringMatching(keyPattern('ai.diagnose')),
    }));
  });

  it('transcribe reservation ref includes a stable idempotency key', async () => {
    const billing = billingSvc();
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
    const factory = makeWsFactory([{ code: 0, data: { status: 2, result: { ws: [{ cw: [{ w: 'ok' }] }] } } }]);

    await svc.transcribe(user, Buffer.from('audio'), factory);

    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.transcribe, expect.objectContaining({
      refType: 'ai.transcribe',
      idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
    }));
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
      refType: 'ai.transcribe',
      idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
    }));
  });

  it('transcribe repeats use different reservation idempotency keys for the same audio', async () => {
    const billing = billingSvc();
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
    const factory = makeWsFactory([{ code: 0, data: { status: 2, result: { ws: [{ cw: [{ w: 'ok' }] }] } } }]);

    await svc.transcribe(user, Buffer.from('audio'), factory);
    await svc.transcribe(user, Buffer.from('audio'), factory);

    expect(billing.reserve.mock.calls[0][3].idempotencyKey).not.toBe(billing.reserve.mock.calls[1][3].idempotencyKey);
    expect(billing.confirmReservation.mock.calls[0][2].idempotencyKey).not.toBe(billing.confirmReservation.mock.calls[1][2].idempotencyKey);
  });

  it('transcribe releases the reservation when Xfyun fails', async () => {
    const billing = billingSvc();
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);
    const factory = makeWsFactory([{ code: 10001, message: 'bad' }]);

    await expect(svc.transcribe(user, Buffer.from('audio'), factory)).rejects.toBeInstanceOf(BadGatewayException);

    expect(billing.releaseReservation).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.transcribe, expect.objectContaining({
      refType: 'ai.transcribe',
      idempotencyKey: expect.stringMatching(keyPattern('ai.transcribe')),
    }));
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });

  it('transcribe reserve failure does not start Xfyun or release', async () => {
    const billing = billingSvc();
    billing.reserve.mockRejectedValueOnce(new Error('insufficient'));
    const factory = vi.fn();
    const svc = new AiService(noProv, integrationSvc({ appId: 'a', apiKey: 'k', apiSecret: 's' }), billing, {} as any, {} as any);

    await expect(svc.transcribe(user, Buffer.from('audio'), factory)).rejects.toThrow('insufficient');

    expect(factory).not.toHaveBeenCalled();
    expect(billing.releaseReservation).not.toHaveBeenCalled();
    expect(billing.confirmReservation).not.toHaveBeenCalled();
  });
});

describe('AiService.advice', () => {
  it('builds advice prompt before billing reserve can shift clock time', async () => {
    const billing = billingSvc();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-11T00:00:00Z'));
    billing.reserve.mockImplementationOnce(async () => {
      now.mockReturnValue(Date.parse('2026-01-12T00:00:00Z'));
      return { reservationId: 'res1', balanceAfter: 0 };
    });
    let requestBody: any;
    const prisma: any = {
      batch: { findFirst: async () => ({ id: 'b1', cropName: 'crop', status: 'Growing', plantDate: new Date('2026-01-01T00:00:00Z') }) },
      farmRecord: { findMany: async () => [] },
      cropPhenology: { findMany: async () => [] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { assertInScope: async () => {}, ownedEntityWhere: () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, billing, prisma, scope);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'advice' } }] }) };
    }));

    try {
      await svc.advice(user, { batchId: 'b1' });

      expect(requestBody.messages[0].content).toContain('已种植10天');
    } finally {
      now.mockRestore();
    }
  });

  it('advice reserves and confirms AI credits', async () => {
    const billing = billingSvc();
    const prisma: any = {
      batch: { findFirst: async () => ({ id: 'b1', cropName: 'crop', status: 'Growing', plantDate: new Date('2026-01-01') }) },
      farmRecord: { findMany: async () => [{ action: 'water' }] },
      cropPhenology: { findMany: async () => [{ expectedDays: 30 }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { assertInScope: async () => {}, ownedEntityWhere: () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, billing, prisma, scope);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'advice' } }] }) }));

    const res = await svc.advice(user, { batchId: 'b1' });

    expect(res.answer).toContain('advice');
    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, {
      refType: 'ai.advice',
      refId: 'b1',
      idempotencyKey: expect.stringMatching(/^ai\.advice:t1:u1:b1:[a-f0-9]{16}$/),
    });
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', {
      refType: 'ai.advice',
      refId: 'b1',
      idempotencyKey: expect.stringMatching(/^ai\.advice:t1:u1:b1:[a-f0-9]{16}$/),
    });
  });

  it('advice repeats use different reservation idempotency keys for the same batch', async () => {
    const billing = billingSvc();
    const prisma: any = {
      batch: { findFirst: async () => ({ id: 'b1', cropName: 'crop', status: 'Growing', plantDate: new Date('2026-01-01') }) },
      farmRecord: { findMany: async () => [{ action: 'water' }] },
      cropPhenology: { findMany: async () => [{ expectedDays: 30 }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { assertInScope: async () => {}, ownedEntityWhere: () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, billing, prisma, scope);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'advice' } }] }) }));

    await svc.advice(user, { batchId: 'b1' });
    await svc.advice(user, { batchId: 'b1' });

    expect(billing.reserve.mock.calls[0][3]).toEqual(expect.objectContaining({ refType: 'ai.advice', refId: 'b1' }));
    expect(billing.reserve.mock.calls[1][3]).toEqual(expect.objectContaining({ refType: 'ai.advice', refId: 'b1' }));
    expect(billing.reserve.mock.calls[0][3].idempotencyKey).not.toBe(billing.reserve.mock.calls[1][3].idempotencyKey);
  });
});

describe('AiService.ask', () => {
  it('ask reserves and confirms AI credits', async () => {
    const billing = billingSvc();
    const prisma: any = {
      batch: { findMany: async () => [{ batchNo: 'B1', cropName: 'crop', status: 'Growing', plantDate: new Date('2026-01-01') }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { ownedEntityWhere: () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, billing, prisma, scope);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'summary' } }] }) }));

    const res = await svc.ask(user, { question: 'current batches?' });

    expect(res.answer).toContain('summary');
    expect(billing.reserve).toHaveBeenCalledWith(user, 'AI', AI_WEIGHT.chat, expect.objectContaining({
      refType: 'ai.ask',
      idempotencyKey: expect.stringMatching(keyPattern('ai.ask')),
    }));
    expect(billing.confirmReservation).toHaveBeenCalledWith(user, 'AI', expect.objectContaining({
      refType: 'ai.ask',
      idempotencyKey: expect.stringMatching(keyPattern('ai.ask')),
    }));
  });

  it('ask repeats use different reservation idempotency keys for the same question', async () => {
    const billing = billingSvc();
    const prisma: any = {
      batch: { findMany: async () => [{ batchNo: 'B1', cropName: 'crop', status: 'Growing', plantDate: new Date('2026-01-01') }] },
    };
    const providers: any = { getEnabled: async () => ({ baseUrl: 'http://x', apiKey: 'k', textModel: 'm' }) };
    const scope: any = { ownedEntityWhere: () => ({ tenantId: 't1' }) };
    const svc = new AiService(providers, {} as any, billing, prisma, scope);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'summary' } }] }) }));

    await svc.ask(user, { question: 'current batches?' });
    await svc.ask(user, { question: 'current batches?' });

    expect(billing.reserve.mock.calls[0][3].idempotencyKey).not.toBe(billing.reserve.mock.calls[1][3].idempotencyKey);
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

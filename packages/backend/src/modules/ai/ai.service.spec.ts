import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from './ai.service';
import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@nongchang/shared';

const user = { userId: 'u1', tenantId: 't1', role: 'merchant' } as AuthUser;
function providerSvc(enabled: any) { return { getEnabled: async () => enabled } as any; }

describe('AiService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('无 provider 抛业务错误', async () => {
    const svc = new AiService(providerSvc(null));
    await expect(svc.chat(user, 'hi')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chat 返回模型回答', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }));
    const r = await svc.chat(user, 'hi');
    expect(r.answer).toBe('你好');
  });

  it('diagnose 无 visionModel 抛错', async () => {
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: null }));
    await expect(svc.diagnose(user, { imageUrl: 'https://x.com/a.jpg' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('diagnose 用 visionModel 返回结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '叶片缺氮' } }] }) })));
    const svc = new AiService(providerSvc({ baseUrl: 'https://x.com/v1', apiKey: 'sk-1', textModel: 'm', visionModel: 'vm' }));
    const r = await svc.diagnose(user, { imageBase64: 'AAAA' });
    expect(r.result).toBe('叶片缺氮');
  });
});

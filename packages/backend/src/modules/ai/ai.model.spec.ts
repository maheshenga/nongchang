import { describe, expect, it } from 'vitest';
import { Role, type AuthUser } from '@nongchang/shared';
import {
  buildAdviceChatBody,
  buildAiOperationRef,
  buildAskChatBody,
  buildChatCompletionBody,
  buildDiagnoseChatBody,
} from './ai.model';

const user: AuthUser = {
  userId: 'u1',
  tenantId: 't1',
  role: Role.MERCHANT,
  agentId: null,
  ownerId: 'u1',
  sessionVersion: 0,
};

describe('ai.model operation refs', () => {
  it('builds operation refs with the existing key format', () => {
    const ref = buildAiOperationRef('ai.advice', user, 'abcdef0123456789', 'b1');

    expect(ref).toEqual({
      refType: 'ai.advice',
      refId: 'b1',
      idempotencyKey: 'ai.advice:t1:u1:b1:abcdef0123456789',
    });
    expect(ref.idempotencyKey).toMatch(/^ai\.advice:t1:u1:b1:[a-f0-9]{16}$/);
  });

  it('omits refId when the operation has no resource id', () => {
    expect(buildAiOperationRef('ai.chat', user, 'abcdef0123456789')).toEqual({
      refType: 'ai.chat',
      idempotencyKey: 'ai.chat:t1:u1:abcdef0123456789',
    });
  });
});

describe('ai.model chat bodies', () => {
  it('builds a text chat completion body', () => {
    expect(buildChatCompletionBody('text-model', 'hello')).toEqual({
      model: 'text-model',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('builds the existing advice prompt from batch records and phenology', () => {
    const body = buildAdviceChatBody(
      'text-model',
      {
        batch: { cropName: 'tomato', status: 'Growing', plantDate: new Date('2026-01-01') },
        records: [{ action: 'water' }, { action: 'fertilize' }],
        phenology: [{ expectedDays: 30 }, { expectedDays: 20 }],
      },
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body).toEqual({
      model: 'text-model',
      messages: [{
        role: 'user',
        content: '你是农技专家。作物:tomato;当前状态:Growing;已种植10天;标准全周期50天。近期农事:water、fertilize。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。',
      }],
    });
  });

  it('uses fallback advice context when batch data is missing', () => {
    const body = buildAdviceChatBody(
      'text-model',
      { batch: null, records: [], phenology: [] },
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body.messages[0].content).toBe('你是农技专家。作物:undefined;当前状态:undefined;已种植0天;标准全周期未知天。近期农事:无。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。');
  });

  it('builds the existing ask prompt from visible batch summaries', () => {
    const body = buildAskChatBody(
      'text-model',
      [{ batchNo: 'B1', cropName: 'corn', status: 'Growing', plantDate: new Date('2026-01-01') }],
      'current batches?',
      Date.parse('2026-01-11T00:00:00Z'),
    );

    expect(body).toEqual({
      model: 'text-model',
      messages: [{
        role: 'user',
        content: '以下是用户可见的批次数据:B1(corn,Growing,种植10天)。请根据数据回答问题:current batches?',
      }],
    });
  });

  it('uses empty-data ask prompt when no batches are visible', () => {
    const body = buildAskChatBody('text-model', [], 'anything?', Date.parse('2026-01-11T00:00:00Z'));

    expect(body.messages[0].content).toBe('以下是用户可见的批次数据:无数据。请根据数据回答问题:anything?');
  });

  it('builds diagnose body from imageUrl and note', () => {
    expect(buildDiagnoseChatBody('vision-model', { imageUrl: 'https://img.test/a.jpg', note: 'yellow leaf' })).toEqual({
      model: 'vision-model',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '请诊断该作物可能的病害并给出处理建议。 备注:yellow leaf' },
          { type: 'image_url', image_url: { url: 'https://img.test/a.jpg' } },
        ],
      }],
    });
  });

  it('builds diagnose body from base64 input', () => {
    const body = buildDiagnoseChatBody('vision-model', { imageBase64: 'AAAA' });

    expect(body.messages[0].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,AAAA' },
    });
  });
});

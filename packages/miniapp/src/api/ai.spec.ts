import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { aiChat, aiDiagnose, normalizeAiError, transcribeVoice } from './ai';

const okResp = (data: unknown) => ({ statusCode: 200, data });

describe('api/ai', () => {
  beforeEach(() => (taro as any).__reset());

  it('aiChat posts message and returns answer', async () => {
    (taro.request as any).mockResolvedValue(okResp({ answer: '叶斑病' }));
    const out = await aiChat('番茄叶发黄?');
    expect(out).toBe('叶斑病');
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/ai\/chat$/);
    expect(arg.method).toBe('POST');
    expect(arg.data).toEqual({ message: '番茄叶发黄?' });
  });

  it('aiDiagnose posts imageUrl + note and returns result', async () => {
    (taro.request as any).mockResolvedValue(okResp({ result: '健康' }));
    const out = await aiDiagnose('https://x/i.jpg', '症状3天');
    expect(out).toBe('健康');
    const arg = (taro.request as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/ai\/diagnose$/);
    expect(arg.data).toEqual({ imageUrl: 'https://x/i.jpg', note: '症状3天' });
  });

  it('aiDiagnose omits note when empty', async () => {
    (taro.request as any).mockResolvedValue(okResp({ result: 'ok' }));
    await aiDiagnose('https://x/i.jpg', '');
    expect((taro.request as any).mock.calls[0][0].data).toEqual({ imageUrl: 'https://x/i.jpg' });
  });

  it('normalizeAiError maps provider-missing to friendly text', () => {
    expect(normalizeAiError(new Error('AI 服务商未配置'))).toBe('AI 服务未配置，请联系管理员');
    expect(normalizeAiError(new Error('boom'))).toBe('boom');
    expect(normalizeAiError('x')).toBe('AI 调用失败');
  });

  it('transcribeVoice uploads file and returns text', async () => {
    (taro.uploadFile as any).mockResolvedValue({ statusCode: 200, data: JSON.stringify({ text: '浇水完成' }) });
    const out = await transcribeVoice('/tmp/a.pcm');
    expect(out).toBe('浇水完成');
    const arg = (taro.uploadFile as any).mock.calls[0][0];
    expect(arg.url).toMatch(/\/ai\/transcribe$/);
    expect(arg.name).toBe('file');
    expect(arg.filePath).toBe('/tmp/a.pcm');
  });

  it('transcribeVoice surfaces backend message on non-2xx', async () => {
    (taro.uploadFile as any).mockResolvedValue({ statusCode: 400, data: JSON.stringify({ message: '未配置讯飞语音' }) });
    await expect(transcribeVoice('/tmp/a.pcm')).rejects.toThrow('未配置讯飞语音');
  });
});

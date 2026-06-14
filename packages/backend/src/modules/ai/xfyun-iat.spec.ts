import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { buildXfyunIatAuthUrl } from './xfyun-iat';

describe('buildXfyunIatAuthUrl', () => {
  const fixed = {
    apiKey: 'test_api_key',
    apiSecret: 'test_api_secret',
    date: 'Wed, 10 Jul 2024 07:28:00 GMT',
  };

  it('targets the iat wss endpoint', () => {
    const url = buildXfyunIatAuthUrl(fixed);
    expect(url.startsWith('wss://iat-api.xfyun.cn/v2/iat?')).toBe(true);
  });

  it('includes authorization, date and host query params', () => {
    const url = new URL(buildXfyunIatAuthUrl(fixed));
    expect(url.searchParams.get('host')).toBe('iat-api.xfyun.cn');
    expect(url.searchParams.get('date')).toBe(fixed.date);
    expect(url.searchParams.get('authorization')).toBeTruthy();
  });

  it('authorization decodes to the expected origin with correct HMAC signature', () => {
    const url = new URL(buildXfyunIatAuthUrl(fixed));
    const decoded = Buffer.from(url.searchParams.get('authorization')!, 'base64').toString();

    const signatureOrigin = `host: iat-api.xfyun.cn\ndate: ${fixed.date}\nGET /v2/iat HTTP/1.1`;
    const expectedSig = createHmac('sha256', fixed.apiSecret).update(signatureOrigin).digest('base64');

    expect(decoded).toContain(`api_key="${fixed.apiKey}"`);
    expect(decoded).toContain('algorithm="hmac-sha256"');
    expect(decoded).toContain('headers="host date request-line"');
    expect(decoded).toContain(`signature="${expectedSig}"`);
  });

  it('different apiSecret yields different signature', () => {
    const a = new URL(buildXfyunIatAuthUrl(fixed)).searchParams.get('authorization');
    const b = new URL(buildXfyunIatAuthUrl({ ...fixed, apiSecret: 'other' })).searchParams.get('authorization');
    expect(a).not.toBe(b);
  });
});

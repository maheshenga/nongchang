import { describe, it, expect, beforeEach } from 'vitest';
import taro from '@tarojs/taro';
import { listTraceEvents } from './trace';

describe('api/trace', () => {
  beforeEach(() => (taro as any).__reset());
  it('GETs /trace/events/:batchId', async () => {
    (taro.request as any).mockResolvedValue({ statusCode: 200, data: [{ type: 'origin', title: '播种' }] });
    const out = await listTraceEvents('b1');
    expect(out).toHaveLength(1);
    expect((taro.request as any).mock.calls[0][0].url).toMatch(/\/trace\/events\/b1$/);
  });
});

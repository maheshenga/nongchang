import { describe, expect, it } from 'vitest';
import { buildSupportMessage } from './support';

describe('support contact copy', () => {
  it('falls back to administrator guidance without inventing contact details', () => {
    expect(buildSupportMessage('')).toBe('请联系平台管理员');
    expect(buildSupportMessage('')).not.toMatch(/400-000-0000/);
  });

  it('uses the configured contact exactly after trimming it', () => {
    expect(buildSupportMessage(' support@example.com ')).toBe('请联系平台管理员：support@example.com');
  });
});

import { describe, it, expect } from 'vitest';
import { API_BASE_URL, SUPPORT_CONTACT } from './env';

describe('config/env', () => {
  it('exposes a non-empty /api base url', () => {
    expect(API_BASE_URL).toMatch(/\/api$/);
  });

  it('defaults support contact to an empty truthful configuration', () => {
    expect(SUPPORT_CONTACT).toBe('');
  });
});

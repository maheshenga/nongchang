import { describe, it, expect } from 'vitest';
import { API_BASE_URL } from './env';

describe('config/env', () => {
  it('exposes a non-empty /api base url', () => {
    expect(API_BASE_URL).toMatch(/\/api$/);
  });
});

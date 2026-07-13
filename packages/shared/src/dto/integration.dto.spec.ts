import { describe, expect, it } from 'vitest';
import {
  wechatRegisterResponseSchema,
  wechatRegistrationStatusResponseSchema,
} from './integration.dto';

describe('WeChat registration response contracts', () => {
  it('requires the real application identifier returned by registration', () => {
    expect(wechatRegisterResponseSchema.parse({
      applicationId: 'user-1',
      status: 'pending',
    })).toEqual({ applicationId: 'user-1', status: 'pending' });
    expect(() => wechatRegisterResponseSchema.parse({ status: 'pending' })).toThrow();
  });

  it('limits registration status to truthful stored-state mappings', () => {
    expect(wechatRegistrationStatusResponseSchema.parse({
      applicationId: 'user-1',
      displayName: '张三',
      status: 'approved',
      updatedAt: null,
    }).status).toBe('approved');
    expect(() => wechatRegistrationStatusResponseSchema.parse({
      applicationId: 'user-1',
      displayName: '张三',
      status: 'rejected',
      updatedAt: null,
    })).toThrow();
  });
});

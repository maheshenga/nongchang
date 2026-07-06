import { describe, expect, it } from 'vitest';
import { buildHelmetOptions } from './helmet-options';

describe('buildHelmetOptions', () => {
  it('enables scoped CSP with required SaaS integrations', () => {
    const options = buildHelmetOptions({
      ossBaseUrl: 'https://cdn.example.com/assets',
    });

    expect(options.crossOriginEmbedderPolicy).toBe(false);
    expect(options.contentSecurityPolicy).toBeTruthy();
    expect(options.contentSecurityPolicy).not.toBe(false);

    const directives = options.contentSecurityPolicy && typeof options.contentSecurityPolicy === 'object'
      ? options.contentSecurityPolicy.directives
      : {};

    expect(directives?.defaultSrc).toEqual(["'self'"]);
    expect(directives?.imgSrc).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://cdn.example.com']));
    expect(directives?.scriptSrc).toEqual(expect.arrayContaining(["'self'", 'https://api.tianditu.gov.cn', 'https://*.tianditu.gov.cn']));
    expect(directives?.connectSrc).toEqual(expect.arrayContaining(["'self'", 'https://api.tianditu.gov.cn', 'https://*.tianditu.gov.cn']));
    expect(directives?.formAction).toEqual(expect.arrayContaining([
      "'self'",
      'https://alipay.com',
      'https://*.alipay.com',
      'https://alipaydev.com',
      'https://*.alipaydev.com',
    ]));
  });
});

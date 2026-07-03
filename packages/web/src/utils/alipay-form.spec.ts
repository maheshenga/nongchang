import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectToAlipayUrl, submitAlipayForm } from './alipay-form';

describe('submitAlipayForm', () => {
  let submitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    submitSpy = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
  });

  afterEach(() => {
    submitSpy.mockRestore();
  });

  it('rebuilds and submits a hidden Alipay form', () => {
    submitAlipayForm(`
      <form method="post" action="https://openapi.alipay.com/gateway.do">
        <input type="hidden" name="biz_content" value="{}" />
        <input type="hidden" name="sign" value="abc" />
      </form>
    `);

    const form = document.body.querySelector('form') as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(form.action).toBe('https://openapi.alipay.com/gateway.do');
    expect(form.querySelectorAll('input')).toHaveLength(2);
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects non-Alipay form actions', () => {
    expect(() => submitAlipayForm(`
      <form method="post" action="https://example.com/pay">
        <input type="hidden" name="sign" value="abc" />
      </form>
    `)).toThrow('Untrusted Alipay form action');

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('rejects lookalike and insecure Alipay form actions', () => {
    for (const action of [
      'http://openapi.alipay.com/gateway.do',
      'https://evilalipay.com/gateway.do',
      'https://alipay.com.evil.com/gateway.do',
    ]) {
      expect(() => submitAlipayForm(`
        <form method="post" action="${action}">
          <input type="hidden" name="sign" value="abc" />
        </form>
      `)).toThrow('Untrusted Alipay form action');
    }

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid form shapes and methods', () => {
    expect(() => submitAlipayForm('')).toThrow('Invalid Alipay form');
    expect(() => submitAlipayForm(`
      <form method="post" action="https://openapi.alipay.com/gateway.do"></form>
      <form method="post" action="https://openapi.alipay.com/gateway.do"></form>
    `)).toThrow('Invalid Alipay form');
    expect(() => submitAlipayForm(`
      <form method="get" action="https://openapi.alipay.com/gateway.do">
        <input type="hidden" name="sign" value="abc" />
      </form>
    `)).toThrow('Invalid Alipay form method');

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('rejects active content in the form payload', () => {
    for (const activeContent of [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)" />',
      '<svg onload="alert(1)"></svg>',
    ]) {
      expect(() => submitAlipayForm(`
        <form method="post" action="https://openapi.alipay.com/gateway.do">
          ${activeContent}
          <input type="hidden" name="sign" value="abc" />
        </form>
      `)).toThrow('Invalid Alipay form content');
    }

    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('treats hidden input values as inert data', () => {
    submitAlipayForm(`
      <form method="post" action="https://openapi.alipay.com/gateway.do">
        <input type="hidden" name="biz_content" value="<img src=x onerror='alert(1)'>" />
      </form>
    `);

    const input = document.body.querySelector('input[name="biz_content"]') as HTMLInputElement;
    expect(input.value).toBe("<img src=x onerror='alert(1)'>");
    expect(document.body.querySelector('img')).toBeNull();
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});

describe('redirectToAlipayUrl', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
  });

  afterEach(() => {
    window.history.replaceState(null, '', originalLocation.href);
  });

  it('rejects unsafe payment URLs', () => {
    expect(() => redirectToAlipayUrl('javascript:alert(1)')).toThrow('Untrusted Alipay payment URL');
    expect(() => redirectToAlipayUrl('https://example.com/pay')).toThrow('Untrusted Alipay payment URL');
  });
});

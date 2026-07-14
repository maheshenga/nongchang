import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');

describe('irreversible account closure workflow', () => {
  it('explains exactly what is removed and retained', () => {
    expect(source).toContain('登录用户名、显示名称、手机号、微信绑定、用户组和登录凭据');
    expect(source).toContain('生产、溯源、审计、支付、订单、额度与财务记录');
    expect(source).toContain('我的数据');
    expect(source).toContain("confirmation === '注销账号'");
    expect(source).toContain('将进行一次新的微信身份验证');
  });

  it('starts closure only from the final confirmation success callback', () => {
    expect(source).toContain("title: '最后确认注销账号'");
    expect(source).toContain("confirmText: '确认注销'");
    expect(source).toContain("confirmColor: '#d13438'");
    expect(source.match(/void performClosure\(\)/g)).toHaveLength(1);
    expect(source.indexOf('success: result =>')).toBeLessThan(source.indexOf('void performClosure()'));
    expect(source).toContain('if (!result.confirm) return');
    expect(source).toContain('closeMyAccount');
    expect(source).toContain('closeMyWechatAccount');
  });
});

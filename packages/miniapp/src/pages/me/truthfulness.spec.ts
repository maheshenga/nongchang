import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'index.tsx');
const source = readFileSync(sourcePath, 'utf8');
const profileHeaderSource = readFileSync(join(dirname(sourcePath), 'MeProfileHeader.tsx'), 'utf8');
const legalAccountSource = readFileSync(join(dirname(sourcePath), 'MeLegalAccountSection.tsx'), 'utf8');

describe('Me page truthful copy', () => {
  it('uses traceability record copy instead of blockchain storage claims', () => {
    expect(source).not.toMatch(/区块链|上链|哈希|存证/);
    expect(source).toContain('溯源记录');
  });

  it('uses truthful account, support, retry, and trace navigation actions', () => {
    expect(source).not.toContain('400-000-0000');
    expect(source).not.toContain("useState('农技员')");
    expect(source).toContain('buildSupportMessage(SUPPORT_CONTACT)');
    expect(source).toContain("Taro.switchTab({ url: '/pages/trace/index' })");
    expect(profileHeaderSource).toContain('重新加载账户');
  });

  it('offers real personal data and legal actions, with closure only for eligible roles', () => {
    expect(legalAccountSource).toContain('我的数据');
    expect(legalAccountSource).toContain('隐私政策');
    expect(legalAccountSource).toContain('用户协议');
    expect(legalAccountSource).toContain('注销账号');
    expect(legalAccountSource).toContain('canSelfClose(roleCode)');
    expect(source).not.toContain('蓝牙传感设备配置');
    expect(source).not.toContain('comingSoon');
  });
});

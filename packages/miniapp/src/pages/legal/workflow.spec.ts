import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pageDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(pageDirectory, 'index.tsx'), 'utf8');
const styles = readFileSync(join(pageDirectory, 'index.scss'), 'utf8');

describe('public legal document workflow', () => {
  it('renders a retryable plain-text legal publication without authentication', () => {
    expect(source).toContain('useRouter');
    expect(source).toContain('getPublicLegal');
    expect(source).toContain('隐私政策');
    expect(source).toContain('用户协议');
    expect(source).toContain('operatorName');
    expect(source).toContain('privacyVersion');
    expect(source).toContain('agreementVersion');
    expect(source).toContain('effectiveDate');
    expect(source).toContain('privacyContact');
    expect(source).toContain('contactPhone');
    expect(source).toContain('contactEmail');
    expect(source).toContain('重新加载');
    expect(source).toContain('userSelect');
    expect(styles).toContain('white-space: pre-wrap');
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });

  it('has explicit loading, unavailable, request error, and invalid type states', () => {
    expect(source).toContain('协议加载中');
    expect(source).toContain('协议尚未配置');
    expect(source).toContain('协议加载失败');
    expect(source).toContain('文档类型无效');
  });
});

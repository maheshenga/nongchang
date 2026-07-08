import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

describe('public metadata', () => {
  it('uses readable production SaaS title and description instead of scaffold or mojibake placeholders', () => {
    expect(html).toContain('<title>农业溯源 SaaS 平台 | 农场生产、资质文件管理与一物一码管理</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('农业溯源 SaaS 平台提供农场生产管理');
    expect(html).not.toContain('My Google AI Studio App');
    expect(html).not.toMatch(/鍐|鐢|绉|骞|鎴|�/);
  });

  it('includes share and crawl metadata for the public shell', () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('application/ld+json');
  });
});

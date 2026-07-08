import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemSettings from './SystemSettings';

const apiMocks = vi.hoisted(() => ({
  getOssConfig: vi.fn(),
  upsertOssConfig: vi.fn(),
  testOssConfig: vi.fn(),
}));

vi.mock('../api/oss-config', () => apiMocks);

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'SystemSettings.tsx');

describe('SystemSettings Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getOssConfig.mockResolvedValue({
      region: 'oss-cn-hangzhou',
      bucket: 'farm-assets',
      accessKeyId: 'LTAI-mask',
      accessKeySecretMasked: 'sk-****1234',
      baseUrl: 'https://cdn.example.com',
      enabled: true,
    });
    apiMocks.upsertOssConfig.mockResolvedValue({
      region: 'oss-cn-shanghai',
      bucket: 'farm-assets-prod',
      accessKeyId: 'LTAI-new',
      accessKeySecretMasked: 'sk-****1234',
      baseUrl: 'https://cdn.example.com/assets',
      enabled: true,
    });
    apiMocks.testOssConfig.mockResolvedValue({ ok: true, latencyMs: 23 });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');

    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('fluentStatusTag');
    expect(source).not.toMatch(/slate-|emerald-|rose-|rounded-2xl|rounded-lg|bg-emerald|hover:bg-emerald|text-emerald|focus:ring-emerald|✓|✗/);
  });

  it('renders current OSS config, saves trimmed values without overwriting an empty secret, and tests connection', async () => {
    render(<SystemSettings />);

    expect(await screen.findByDisplayValue('oss-cn-hangzhou')).toBeTruthy();
    expect(screen.getByDisplayValue('farm-assets')).toBeTruthy();
    expect(screen.getByText('AccessKeySecret（当前 sk-****1234，留空不改）')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Region'), { target: { value: ' oss-cn-shanghai ' } });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: ' farm-assets-prod ' } });
    fireEvent.change(screen.getByLabelText('AccessKeyId'), { target: { value: ' LTAI-new ' } });
    fireEvent.change(screen.getByLabelText('Base URL（可选，自定义访问域名）'), {
      target: { value: ' https://cdn.example.com/assets ' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertOssConfig).toHaveBeenCalledWith({
        region: 'oss-cn-shanghai',
        bucket: 'farm-assets-prod',
        accessKeyId: 'LTAI-new',
        baseUrl: 'https://cdn.example.com/assets',
        enabled: true,
      });
    });
    expect(apiMocks.upsertOssConfig.mock.calls[0][0]).not.toHaveProperty('accessKeySecret');

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(apiMocks.testOssConfig).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('连接正常 23ms')).toBeTruthy();
  });
});

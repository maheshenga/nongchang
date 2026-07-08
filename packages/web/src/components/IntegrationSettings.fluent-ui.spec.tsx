import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IntegrationSettings from './IntegrationSettings';

const apiMocks = vi.hoisted(() => ({
  getIntegrationConfig: vi.fn(),
  upsertWechatConfig: vi.fn(),
  upsertXfyunConfig: vi.fn(),
  upsertTiandituConfig: vi.fn(),
}));

vi.mock('../api/integration', () => ({
  getIntegrationConfig: apiMocks.getIntegrationConfig,
  upsertWechatConfig: apiMocks.upsertWechatConfig,
  upsertXfyunConfig: apiMocks.upsertXfyunConfig,
  upsertTiandituConfig: apiMocks.upsertTiandituConfig,
}));

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), 'IntegrationSettings.tsx');

describe('IntegrationSettings Fluent UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getIntegrationConfig.mockImplementation((provider: string) => Promise.resolve({
      provider,
      appId: provider === 'tianditu' ? '  tianditu-key-old  ' : `${provider}-app-old`,
      secretMasked: provider === 'wechat' ? 'sec***old' : null,
      apiKeyMasked: provider === 'xfyun' ? 'key***old' : null,
      apiSecretMasked: provider === 'xfyun' ? 'secret***old' : null,
      enabled: provider !== 'tianditu',
    }));
    apiMocks.upsertWechatConfig.mockResolvedValue({
      provider: 'wechat',
      appId: 'wx-new',
      secretMasked: 'sec***new',
      apiKeyMasked: null,
      apiSecretMasked: null,
      enabled: false,
    });
    apiMocks.upsertXfyunConfig.mockResolvedValue({
      provider: 'xfyun',
      appId: 'xfyun-new',
      secretMasked: null,
      apiKeyMasked: 'key***new',
      apiSecretMasked: 'secret***new',
      enabled: true,
    });
    apiMocks.upsertTiandituConfig.mockResolvedValue({
      provider: 'tianditu',
      appId: 'tk-new',
      secretMasked: null,
      apiKeyMasked: null,
      apiSecretMasked: null,
      enabled: true,
    });
  });

  it('keeps the source inside the Fluent UI boundary', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('fluentButton');
    expect(source).toContain('fluentInput');
    expect(source).toContain('LoadingState');
    expect(source).toContain('ErrorState');
    expect(source).toContain('fluentStatusTag');
    const forbiddenClassTokens = [
      'text-slate-',
      'bg-slate-',
      'border-slate-',
      'ring-slate-',
      'text-emerald-',
      'bg-emerald-',
      'border-emerald-',
      'hover:bg-emerald-',
      'focus:ring-emerald-',
      'text-rose-',
      'bg-rose-',
      'border-rose-',
      'rounded-2xl',
      'rounded-xl',
      'rounded-lg',
      'shadow-xl',
      'shadow-2xl',
    ];
    for (const token of forbiddenClassTokens) {
      expect(source).not.toContain(token);
    }
  });

  it('saves integration settings without overwriting masked secrets left blank', async () => {
    render(<IntegrationSettings />);

    const wechatCard = await screen.findByRole('region', { name: '微信小程序登录' });
    await waitFor(() => {
      expect((within(wechatCard).getByLabelText('AppID') as HTMLInputElement).value).toBe('wechat-app-old');
    });
    fireEvent.change(within(wechatCard).getByLabelText('AppID'), { target: { value: ' wx-new ' } });
    fireEvent.click(within(wechatCard).getByLabelText('启用微信登录'));
    fireEvent.click(within(wechatCard).getByRole('button', { name: '保存微信配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertWechatConfig).toHaveBeenCalledWith({ appId: 'wx-new', enabled: false });
    });

    const xfyunCard = await screen.findByRole('region', { name: '讯飞语音转写' });
    await waitFor(() => {
      expect((within(xfyunCard).getByLabelText('APPID') as HTMLInputElement).value).toBe('xfyun-app-old');
    });
    fireEvent.change(within(xfyunCard).getByLabelText('APPID'), { target: { value: ' xfyun-new ' } });
    fireEvent.change(within(xfyunCard).getByLabelText('APIKey'), { target: { value: ' new-key ' } });
    fireEvent.click(within(xfyunCard).getByRole('button', { name: '保存讯飞配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertXfyunConfig).toHaveBeenCalledWith({
        appId: 'xfyun-new',
        apiKey: 'new-key',
        enabled: true,
      });
    });

    const tiandituCard = await screen.findByRole('region', { name: '天地图底图' });
    await waitFor(() => {
      expect((within(tiandituCard).getByLabelText('浏览器端 key') as HTMLInputElement).value).toBe('  tianditu-key-old  ');
    });
    fireEvent.change(within(tiandituCard).getByLabelText('浏览器端 key'), { target: { value: ' tk-new ' } });
    fireEvent.click(within(tiandituCard).getByLabelText('启用天地图底图'));
    fireEvent.click(within(tiandituCard).getByRole('button', { name: '保存天地图配置' }));

    await waitFor(() => {
      expect(apiMocks.upsertTiandituConfig).toHaveBeenCalledWith({ key: 'tk-new', enabled: true });
    });
  });
});

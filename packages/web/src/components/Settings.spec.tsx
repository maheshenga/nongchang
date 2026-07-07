import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Settings from './Settings';
import { ToastBanner } from '../hooks/useToast';

const OLD_STYLE_MARKERS = [
  'bg-emerald',
  'text-emerald',
  'border-emerald',
  'rounded-2xl',
  'rounded-3xl',
  'shadow-xl',
  'shadow-sm',
];

const renderSettings = () => render(<><Settings /><ToastBanner /></>);

describe('Settings production wording', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not claim unimplemented system capabilities', () => {
    renderSettings();

    expect(screen.queryByText(/IoT/i)).toBeNull();
    expect(screen.queryByText(/区块链/)).toBeNull();
    expect(screen.queryByText(/智能合约/)).toBeNull();
    expect(screen.queryByText(/推送/)).toBeNull();
    expect(screen.queryByText(/通知订阅/)).toBeNull();
    expect(screen.queryByText(/系统参数/)).toBeNull();
  });

  it('saves only local display preferences', () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText('紧凑表格'));
    fireEvent.click(screen.getByRole('button', { name: /保存本地偏好/ }));

    expect(localStorage.getItem('agri_display_preferences')).toContain('"compactTables":true');
    expect(screen.getByText('本地偏好已保存')).toBeTruthy();
  });

  it('uses the Fluent settings surface instead of the old emerald card style', () => {
    const { container } = renderSettings();

    expect(screen.getByRole('heading', { name: '本地偏好' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /保存本地偏好/ })).toBeTruthy();
    expect(container.innerHTML).toContain('border-[#E1DFDD]');
    for (const marker of OLD_STYLE_MARKERS) {
      expect(container.innerHTML).not.toContain(marker);
    }
  });
});

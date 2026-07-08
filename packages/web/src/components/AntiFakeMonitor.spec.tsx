import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AntiFakeMonitor from './AntiFakeMonitor';

const antiFakeMocks = vi.hoisted(() => ({
  listScans: vi.fn(),
  listAlerts: vi.fn(),
  freezeCode: vi.fn(),
  unfreezeCode: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock('../api/anti-fake', () => antiFakeMocks);
vi.mock('../hooks/useToast', () => toastMocks);

const source = () => readFileSync(join(process.cwd(), 'src/components/AntiFakeMonitor.tsx'), 'utf8');

const activeAlert = {
  code: 'TRACE-1',
  batchId: 'batch-1',
  distinctIps: 3,
  scanCount: 5,
  locations: ['10.0.0.1', '10.0.0.2'],
  lastScanAt: '2026-07-09T01:00:00.000Z',
  frozen: false,
};

describe('AntiFakeMonitor Fluent trust boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    antiFakeMocks.listScans.mockResolvedValue([
      {
        id: 'scan-1',
        code: 'TRACE-1',
        batchId: 'batch-1',
        ip: '10.0.0.1',
        userAgent: 'UA',
        scannedAt: '2026-07-09T01:00:00.000Z',
      },
    ]);
    antiFakeMocks.listAlerts.mockResolvedValue([activeAlert]);
    antiFakeMocks.freezeCode.mockResolvedValue({ code: 'TRACE-1', frozen: true });
    antiFakeMocks.unfreezeCode.mockResolvedValue({ code: 'TRACE-1', frozen: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses Fluent primitives and avoids legacy/global-overclaim tokens', () => {
    const text = source();

    expect(text).toContain("from '../ui/fluent'");
    expect(text).toContain("from '../ui/state'");
    expect(text).not.toContain('rounded-xl');
    expect(text).not.toContain('rounded-2xl');
    expect(text).not.toContain('bg-emerald');
    expect(text).not.toContain('hover:bg-emerald');
    expect(text).not.toContain('bg-slate');
    expect(text).not.toContain('border-slate');
    expect(text).not.toContain('text-slate');
    expect(text).not.toContain('shadow-2xl');
    expect(text).not.toContain('全网');
    expect(text).not.toContain('全网');
    expect(text).not.toContain('mockResult');
  });

  it('renders alert and scan data from the real anti-fake API wrappers', async () => {
    render(<AntiFakeMonitor />);

    expect((await screen.findAllByText('TRACE-1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('10.0.0.1').length).toBeGreaterThan(0);
    expect(antiFakeMocks.listAlerts).toHaveBeenCalled();
    expect(antiFakeMocks.listScans).toHaveBeenCalled();
  });

  it('freezes and unfreezes codes through the real anti-fake API wrappers', async () => {
    const { unmount } = render(<AntiFakeMonitor />);

    fireEvent.click(await screen.findByRole('button', { name: /冻结 TRACE-1/ }));
    await waitFor(() => expect(antiFakeMocks.freezeCode).toHaveBeenCalledWith('TRACE-1'));
    expect(toastMocks.showToast).toHaveBeenCalledWith('已冻结溯源码 [TRACE-1]，公开溯源将被拦截');

    antiFakeMocks.listAlerts.mockResolvedValue([{ ...activeAlert, locations: ['10.0.0.1'], frozen: true }]);
    unmount();
    render(<AntiFakeMonitor />);

    fireEvent.click(await screen.findByRole('button', { name: /解冻 TRACE-1/ }));
    await waitFor(() => expect(antiFakeMocks.unfreezeCode).toHaveBeenCalledWith('TRACE-1'));
    expect(toastMocks.showToast).toHaveBeenCalledWith('已解冻溯源码 [TRACE-1]');
  });

  it('schedules and runs alert and scan reloads every 10 seconds while mounted', async () => {
    let scheduledReload: (() => void) | null = null;
    let scheduledDelay: number | undefined;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((handler: TimerHandler, timeout?: number) => {
      if (typeof handler === 'function' && timeout === 10_000) {
        scheduledReload = handler as () => void;
        scheduledDelay = timeout;
      }
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    const { unmount } = render(<AntiFakeMonitor />);

    await waitFor(() => {
      expect(antiFakeMocks.listAlerts).toHaveBeenCalledTimes(1);
      expect(antiFakeMocks.listScans).toHaveBeenCalledTimes(1);
    });

    expect(scheduledDelay).toBe(10_000);
    expect(scheduledReload).not.toBeNull();

    await act(async () => {
      scheduledReload?.();
    });

    await waitFor(() => {
      expect(antiFakeMocks.listAlerts).toHaveBeenCalledTimes(2);
      expect(antiFakeMocks.listScans).toHaveBeenCalledTimes(2);
    });

    unmount();
    setIntervalSpy.mockRestore();
  });

  it('shows shared empty state when there are no alerts or scans', async () => {
    antiFakeMocks.listAlerts.mockResolvedValue([]);
    antiFakeMocks.listScans.mockResolvedValue([]);

    render(<AntiFakeMonitor />);

    expect(await screen.findByRole('status', { name: '暂无异常扫码预警' })).toBeTruthy();
    expect(await screen.findByRole('status', { name: '暂无扫码日志' })).toBeTruthy();
  });
});

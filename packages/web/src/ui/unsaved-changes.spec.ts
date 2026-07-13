import { beforeEach, describe, expect, it, vi } from 'vitest';

const dialogMock = vi.hoisted(() => ({ confirmDialog: vi.fn() }));

vi.mock('../hooks/useDialog', () => dialogMock);

import { confirmUnsavedNavigation, registerUnsavedChangesGuard } from './unsaved-changes';

describe('single unsaved changes navigation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows navigation immediately when the active surface is clean', async () => {
    const unregister = registerUnsavedChangesGuard(() => false);

    await expect(confirmUnsavedNavigation()).resolves.toBe(true);
    expect(dialogMock.confirmDialog).not.toHaveBeenCalled();
    unregister();
  });

  it('asks once before leaving a dirty surface and respects cancellation', async () => {
    dialogMock.confirmDialog.mockResolvedValue(false);
    const unregister = registerUnsavedChangesGuard(() => true);

    await expect(confirmUnsavedNavigation()).resolves.toBe(false);
    expect(dialogMock.confirmDialog).toHaveBeenCalledWith({
      title: '放弃未保存更改',
      message: '当前页面有未保存更改。离开后这些更改将丢失。',
      confirmLabel: '放弃更改',
      cancelLabel: '继续编辑',
      tone: 'danger',
    });
    unregister();
  });

  it('keeps only the most recently registered checker active', async () => {
    const unregisterFirst = registerUnsavedChangesGuard(() => true);
    const unregisterSecond = registerUnsavedChangesGuard(() => false);

    await expect(confirmUnsavedNavigation()).resolves.toBe(true);
    expect(dialogMock.confirmDialog).not.toHaveBeenCalled();

    unregisterFirst();
    unregisterSecond();
  });

  it('reuses one pending confirmation for simultaneous navigation requests', async () => {
    dialogMock.confirmDialog.mockResolvedValue(true);
    const unregister = registerUnsavedChangesGuard(() => true);

    await Promise.all([confirmUnsavedNavigation(), confirmUnsavedNavigation()]);
    expect(dialogMock.confirmDialog).toHaveBeenCalledTimes(1);
    unregister();
  });
});

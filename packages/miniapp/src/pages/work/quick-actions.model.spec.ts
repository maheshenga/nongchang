import { describe, expect, it, vi } from 'vitest';
import { runWorkQuickAction, type WorkQuickActionDeps } from './quick-actions.model';

function deps(overrides: Partial<WorkQuickActionDeps> = {}): WorkQuickActionDeps {
  return {
    offline: false,
    aiBalance: 10,
    openAi: vi.fn(),
    openManual: vi.fn(),
    openLocation: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

describe('work quick actions', () => {
  it('opens the manual record section', () => {
    const value = deps();
    runWorkQuickAction('manual', value);
    expect(value.openManual).toHaveBeenCalledTimes(1);
  });

  it('opens the location workflow', () => {
    const value = deps();
    runWorkQuickAction('location', value);
    expect(value.openLocation).toHaveBeenCalledTimes(1);
  });

  it('blocks AI while offline with honest recovery guidance', () => {
    const value = deps({ offline: true });
    runWorkQuickAction('chat', value);
    expect(value.openAi).not.toHaveBeenCalled();
    expect(value.notify).toHaveBeenCalledWith('离线状态下无法使用 AI，请恢复网络后重试');
  });

  it('blocks AI when the real balance is exhausted', () => {
    const value = deps({ aiBalance: 0 });
    runWorkQuickAction('diagnose', value);
    expect(value.openAi).not.toHaveBeenCalled();
    expect(value.notify).toHaveBeenCalledWith('AI 算力不足，请联系代理商充值');
  });

  it('opens the requested AI task when available', () => {
    const value = deps();
    runWorkQuickAction('diagnose', value);
    expect(value.openAi).toHaveBeenCalledWith('diagnose');
  });
});

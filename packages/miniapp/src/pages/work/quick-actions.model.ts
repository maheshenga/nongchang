export type WorkQuickAction = 'chat' | 'diagnose' | 'manual' | 'location';

export interface WorkQuickActionDeps {
  offline: boolean;
  aiBalance: number | null;
  openAi(mode: 'chat' | 'diagnose'): void;
  openManual(): void;
  openLocation(): void;
  notify(message: string): void;
}

export function runWorkQuickAction(action: WorkQuickAction, deps: WorkQuickActionDeps): void {
  if (action === 'manual') {
    deps.openManual();
    return;
  }
  if (action === 'location') {
    deps.openLocation();
    return;
  }
  if (deps.offline) {
    deps.notify('离线状态下无法使用 AI，请恢复网络后重试');
    return;
  }
  if (deps.aiBalance !== null && deps.aiBalance <= 0) {
    deps.notify('AI 算力不足，请联系代理商充值');
    return;
  }
  deps.openAi(action);
}

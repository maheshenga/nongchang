import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ToastOptions {
  /** 自动消失毫秒数,默认 3000。传 0 不自动消失。 */
  duration?: number;
  /** 自定义图标 */
  icon?: ReactNode;
}

let toastSeq = 0;

export interface ToastItem {
  id: number;
  message: string;
  icon?: ReactNode;
}

// 简化方案:全局共享 toast,避免每个组件重复渲染自己的 toast DOM。
// 使用 useToast() 的组件共享同一个 ToastBanner(应在 App 层只挂一次)。
const listeners = new Set<(item: ToastItem | null) => void>();
let currentToast: ToastItem | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function notify(item: ToastItem | null) {
  currentToast = item;
  listeners.forEach((fn) => fn(item));
}

export function showToast(message: string, opts?: ToastOptions): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const id = ++toastSeq;
  const item: ToastItem = { id, message, icon: opts?.icon };
  notify(item);
  if ((opts?.duration ?? 3000) > 0) {
    timer = setTimeout(() => {
      if (currentToast?.id === id) notify(null);
    }, opts?.duration ?? 3000);
  }
}

/**
 * 消费全局 toast 状态的 hook。组件调用 showToast(...) 即可触发;此 hook 仅用于订阅。
 * ToastBanner 应只在 App 层挂载一次。
 */
export function useToastState(): ToastItem | null {
  const [item, setItem] = useState<ToastItem | null>(currentToast);

  useEffect(() => {
    const fn = (v: ToastItem | null) => setItem(v);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return item;
}

export function ToastBanner() {
  const item = useToastState();
  if (!item) return null;
  return (
    <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 z-50">
      {item.icon ?? <span className="w-5 h-5" />}
      <span className="text-sm font-medium">{item.message}</span>
      <button onClick={() => notify(null)} className="text-white/60 hover:text-white ml-2">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

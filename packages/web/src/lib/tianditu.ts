import { getTiandituKey } from '../api/integration';

// 天地图 JS API v4.0 全局对象类型(只声明本项目用到的子集)。
declare global {
  interface Window {
    T?: any;
    __tdtReady?: Promise<any> | null;
  }
}

// 动态加载天地图脚本。多次调用共享同一 Promise,避免重复注入。
// 可显式传入 key(如公开溯源页,key 随响应下发);不传时按租户配置接口拉取(后台已登录场景)。
// 无 key 或未启用时 reject,调用方据此回退到占位地图。
export function loadTianditu(explicitKey?: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.T) return Promise.resolve(window.T);
  if (window.__tdtReady) return window.__tdtReady;

  window.__tdtReady = (async () => {
    const key = explicitKey ?? (await getTiandituKey()).key;
    if (!key) {
      window.__tdtReady = null;
      throw new Error('未配置天地图 key');
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(key)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        window.__tdtReady = null;
        reject(new Error('天地图脚本加载失败'));
      };
      document.head.appendChild(script);
    });
    if (!window.T) throw new Error('天地图初始化失败');
    return window.T;
  })();

  return window.__tdtReady;
}

// 集中管理 API 地址。开发连本机后端；生产改线上 https 域名并在小程序后台配置合法域名。
// process.env.TARO_APP_API 由 Taro 编译期注入（config/dev.ts / prod.ts 可定义）。
const FALLBACK = 'http://localhost:3001/api';

export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_API) || FALLBACK;

// 微信小程序 AppID。后端以 AppID 全局反查租户,故必须与后台「第三方集成 - 微信」配置一致。
// 由 Taro 编译期注入 TARO_APP_WX_APPID(config/dev.ts / prod.ts 可定义);留空时由后端报「未配置」。
export const WX_APPID: string =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_WX_APPID) || '';


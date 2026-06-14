// 集中管理 API 地址。开发连本机后端；生产改线上 https 域名并在小程序后台配置合法域名。
// process.env.TARO_APP_API 由 Taro 编译期注入（config/dev.ts / prod.ts 可定义）。
const FALLBACK = 'http://localhost:3001/api';

export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env && process.env.TARO_APP_API) || FALLBACK;

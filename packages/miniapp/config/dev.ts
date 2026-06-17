// 开发环境编译期常量。值会被原样替换进代码,故需 JSON.stringify。
// TARO_APP_API:本机后端基址(端口 3001 + 全局前缀 /api)。
// TARO_APP_WX_APPID:微信开发 AppID,留空则微信一键登录会提示「未配置」。
export default {
  mini: {},
  h5: {},
  defineConstants: {
    'process.env.TARO_APP_API': JSON.stringify('http://localhost:3001/api'),
    'process.env.TARO_APP_WX_APPID': JSON.stringify(process.env.TARO_APP_WX_APPID || ''),
  },
};

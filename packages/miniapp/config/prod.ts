// 生产环境编译期常量。值会被原样替换进代码,故需 JSON.stringify。
// 部署前必须替换:
//   1. TARO_APP_API 改为线上 https 域名(如 https://api.example.com/api);
//   2. TARO_APP_WX_APPID 填正式微信 AppID;
//   3. 在小程序后台「开发设置-服务器域名」把上述域名加入 request/uploadFile 合法域名白名单。
// 可通过构建环境变量覆盖,避免把线上地址写死进仓库。
export default {
  mini: {},
  h5: {},
  defineConstants: {
    'process.env.TARO_APP_API': JSON.stringify(
      process.env.TARO_APP_API || 'https://REPLACE_ME.example.com/api',
    ),
    'process.env.TARO_APP_WX_APPID': JSON.stringify(process.env.TARO_APP_WX_APPID || ''),
  },
};

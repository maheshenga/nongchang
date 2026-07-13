import { resolveProductionMiniappEnv } from './production-env';

const { apiUrl, wxAppId, supportContact } = resolveProductionMiniappEnv(process.env);

export default {
  mini: {},
  h5: {},
  defineConstants: {
    'process.env.TARO_APP_API': JSON.stringify(apiUrl),
    'process.env.TARO_APP_WX_APPID': JSON.stringify(wxAppId),
    'process.env.TARO_APP_SUPPORT_CONTACT': JSON.stringify(supportContact),
  },
};

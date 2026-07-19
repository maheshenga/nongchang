import { resolveProductionMiniappEnv } from './production-env';

const { apiUrl, wxAppId } = resolveProductionMiniappEnv(process.env);

export default {
  mini: {},
  h5: {},
  defineConstants: {
    'process.env.TARO_APP_API': JSON.stringify(apiUrl),
    'process.env.TARO_APP_WX_APPID': JSON.stringify(wxAppId),
  },
};

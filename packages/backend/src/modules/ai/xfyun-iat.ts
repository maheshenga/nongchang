import { createHmac } from 'crypto';

const IAT_HOST = 'iat-api.xfyun.cn';
const IAT_PATH = '/v2/iat';

export interface XfyunAuthParams {
  apiKey: string;
  apiSecret: string;
  /** RFC1123 GMT 日期;默认 new Date().toUTCString()。便于测试注入固定值。 */
  date?: string;
}

/**
 * 生成讯飞 IAT WebSocket 鉴权 URL。
 * 签名算法(讯飞官方):对 "host: ...\ndate: ...\nGET /v2/iat HTTP/1.1" 做 HMAC-SHA256(apiSecret),
 * base64 得 signature;再拼 authorization 原文 base64 作为 authorization query 参数。
 */
export function buildXfyunIatAuthUrl(params: XfyunAuthParams): string {
  const date = params.date ?? new Date().toUTCString();
  const signatureOrigin = `host: ${IAT_HOST}\ndate: ${date}\nGET ${IAT_PATH} HTTP/1.1`;
  const signature = createHmac('sha256', params.apiSecret)
    .update(signatureOrigin)
    .digest('base64');
  const authorizationOrigin =
    `api_key="${params.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  const query = new URLSearchParams({ authorization, date, host: IAT_HOST }).toString();
  return `wss://${IAT_HOST}${IAT_PATH}?${query}`;
}

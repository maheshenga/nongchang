import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';

@Injectable()
export class OssService {
  private _client?: OSS;

  private client(): OSS {
    if (!this._client) {
      this._client = new OSS({
        region: process.env.OSS_REGION,
        bucket: process.env.OSS_BUCKET,
        accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
      });
    }
    return this._client;
  }

  // 上传并返回可访问 URL。若配置了 OSS_BASE_URL(CDN/自定义域名)优先用之。
  async put(key: string, buffer: Buffer): Promise<string> {
    const res = await this.client().put(key, buffer);
    const base = process.env.OSS_BASE_URL;
    return base ? `${base.replace(/\/$/, '')}/${key}` : res.url;
  }
}

import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { OssConfigService } from '../oss-config/oss-config.service';

@Injectable()
export class OssService {
  private _client?: OSS;

  constructor(private ossConfig: OssConfigService) {}

  // env 路径懒缓存的默认 client
  private envClient(): OSS {
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

  // 上传并返回可访问 URL。
  // 优先读租户级 DB 配置(传入 tenantId 且已启用),否则回退到环境变量。
  // 注意:不在任何日志/异常中输出 accessKeySecret。
  async put(key: string, buffer: Buffer, tenantId?: string): Promise<string> {
    if (tenantId) {
      const cred = await this.ossConfig.getCredentials(tenantId);
      if (cred) {
        const client = new OSS({
          region: cred.region,
          bucket: cred.bucket,
          accessKeyId: cred.accessKeyId,
          accessKeySecret: cred.accessKeySecret,
        });
        const res = await client.put(key, buffer);
        return cred.baseUrl ? `${cred.baseUrl.replace(/\/$/, '')}/${key}` : res.url;
      }
    }
    // 回退 env
    const res = await this.envClient().put(key, buffer);
    const base = process.env.OSS_BASE_URL;
    return base ? `${base.replace(/\/$/, '')}/${key}` : res.url;
  }
}

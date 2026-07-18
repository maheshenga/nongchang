import { Injectable, Optional } from '@nestjs/common';
import OSS from 'ali-oss';
import { OssConfigService } from '../oss-config/oss-config.service';
import { MetricsService } from '../../telemetry/metrics.service';
import { withOutboundSpan } from '../../telemetry/outbound-span';

@Injectable()
export class OssService {
  private _client?: OSS;

  constructor(
    private ossConfig: OssConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

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
        const res = await withOutboundSpan(
          { provider: 'aliyun-oss', operation: 'upload' },
          () => client.put(key, buffer),
          this.metrics,
        );
        return cred.baseUrl ? `${cred.baseUrl.replace(/\/$/, '')}/${key}` : res.url;
      }
    }
    // 回退 env
    const res = await withOutboundSpan(
      { provider: 'aliyun-oss', operation: 'upload' },
      () => this.envClient().put(key, buffer),
      this.metrics,
    );
    const base = process.env.OSS_BASE_URL;
    return base ? `${base.replace(/\/$/, '')}/${key}` : res.url;
  }

  async delete(key: string, tenantId?: string): Promise<void> {
    if (tenantId) {
      const cred = await this.ossConfig.getCredentials(tenantId);
      if (cred) {
        const client = new OSS({
          region: cred.region,
          bucket: cred.bucket,
          accessKeyId: cred.accessKeyId,
          accessKeySecret: cred.accessKeySecret,
        });
        await withOutboundSpan(
          { provider: 'aliyun-oss', operation: 'delete' },
          () => client.delete(key).then(() => undefined),
          this.metrics,
        );
        return;
      }
    }
    await withOutboundSpan(
      { provider: 'aliyun-oss', operation: 'delete' },
      () => this.envClient().delete(key).then(() => undefined),
      this.metrics,
    );
  }
}

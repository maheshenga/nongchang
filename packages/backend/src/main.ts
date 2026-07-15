import './telemetry/telemetry.bootstrap';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/validate-env';
import { buildHelmetOptions } from './common/security/helmet-options';
import { configureTrustedProxy, parseTrustProxyHops } from './common/network/trusted-proxy';
import { readListenHost } from './common/network/listen-host';

async function bootstrap() {
  // 启动前先做安全密钥 fail-fast 校验,避免带病上线。
  validateEnv();
  const trustProxyHops = parseTrustProxyHops(process.env);
  const app = await NestFactory.create(AppModule);
  configureTrustedProxy(app, trustProxyHops);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  // 安全响应头 + 明确 CSP 白名单。COEP 仍关闭,避免三方地图/支付入口被跨源嵌入策略误伤。
  app.use(helmet(buildHelmetOptions()));
  app.setGlobalPrefix('api');
  const listenHost = readListenHost(process.env);
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001, listenHost);
}
bootstrap();

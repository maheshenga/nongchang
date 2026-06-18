import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/validate-env';

async function bootstrap() {
  // 启动前先做安全密钥 fail-fast 校验,避免带病上线。
  validateEnv();
  const app = await NestFactory.create(AppModule);
  // 安全响应头(HSTS/X-Content-Type-Options/X-Frame-Options 等)。
  // 关闭 CSP/COEP 默认策略,避免影响前后端同源接口与上传;基础头仍生效。
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001, '0.0.0.0');
}
bootstrap();

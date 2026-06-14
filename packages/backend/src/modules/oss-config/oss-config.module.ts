import { Module } from '@nestjs/common';
import { OssConfigService } from './oss-config.service';
import { OssConfigController } from './oss-config.controller';

@Module({
  providers: [OssConfigService],
  controllers: [OssConfigController],
  exports: [OssConfigService],
})
export class OssConfigModule {}

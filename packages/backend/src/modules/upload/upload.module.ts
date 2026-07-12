import { Module } from '@nestjs/common';
import { OssService } from './oss.service';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { OssConfigModule } from '../oss-config/oss-config.module';
import { UploadQuotaService } from './upload-quota.service';

@Module({
  imports: [OssConfigModule],
  providers: [OssService, UploadQuotaService, UploadService],
  exports: [OssService, UploadQuotaService],
  controllers: [UploadController],
})
export class UploadModule {}

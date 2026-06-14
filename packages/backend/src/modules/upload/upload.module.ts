import { Module } from '@nestjs/common';
import { OssService } from './oss.service';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { OssConfigModule } from '../oss-config/oss-config.module';

@Module({
  imports: [OssConfigModule],
  providers: [OssService, UploadService],
  controllers: [UploadController],
})
export class UploadModule {}

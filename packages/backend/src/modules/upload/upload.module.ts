import { Module } from '@nestjs/common';
import { OssService } from './oss.service';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  providers: [OssService, UploadService],
  controllers: [UploadController],
})
export class UploadModule {}

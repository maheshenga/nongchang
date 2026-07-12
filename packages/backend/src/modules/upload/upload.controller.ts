import { Controller, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '@nongchang/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MULTIPART_FILE_LIMITS } from '../../common/upload/upload-limits';
import { UploadService, UploadedFile as UploadedFileShape } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(private svc: UploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { ...MULTIPART_FILE_LIMITS, fileSize: 5 * 1024 * 1024 } }),
  )
  upload(@UploadedFile() file: UploadedFileShape, @CurrentUser() user: AuthUser, @Query('purpose') purpose?: string) {
    return this.svc.upload(file, user.tenantId, { purpose });
  }
}

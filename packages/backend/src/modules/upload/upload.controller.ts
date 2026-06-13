import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService, UploadedFile as UploadedFileShape } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(private svc: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: UploadedFileShape) {
    return this.svc.upload(file);
  }
}

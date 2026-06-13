import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UploadResponse } from '@nongchang/shared';
import { OssService } from './oss.service';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// multer 内存存储文件的最小形状(避免依赖 @types/multer)
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class UploadService {
  constructor(private oss: OssService) {}

  async upload(file: UploadedFile): Promise<UploadResponse> {
    if (!file) throw new BadRequestException('未收到文件');
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new BadRequestException('仅支持 jpg/png/webp 图片');
    if (file.size > MAX_SIZE) throw new BadRequestException('图片不得超过 5MB');

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const key = `farm-records/${yyyymm}/${randomUUID()}.${ext}`;
    const url = await this.oss.put(key, file.buffer);
    return { url };
  }
}

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
const CREDENTIAL_ALLOWED: Record<string, string> = {
  ...ALLOWED,
  'application/pdf': 'pdf',
};

export interface UploadOptions {
  purpose?: 'farm-record' | 'credential' | string;
}

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

  async upload(file: UploadedFile, tenantId?: string, options: UploadOptions = {}): Promise<UploadResponse> {
    if (!file) throw new BadRequestException('未收到文件');
    const purpose = options.purpose ?? 'farm-record';
    if (purpose !== 'farm-record' && purpose !== 'credential') throw new BadRequestException('不支持的上传用途');
    const ext = (purpose === 'credential' ? CREDENTIAL_ALLOWED : ALLOWED)[file.mimetype];
    if (!ext) throw new BadRequestException(purpose === 'credential' ? '仅支持 jpg/png/webp 图片或 PDF' : '仅支持 jpg/png/webp 图片');
    if (file.size > MAX_SIZE) throw new BadRequestException('文件不得超过 5MB');
    if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('PDF 文件内容无效');
    }

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const folder = purpose === 'credential' ? 'credentials' : 'farm-records';
    const key = `${folder}/${yyyymm}/${randomUUID()}.${ext}`;
    const url = await this.oss.put(key, file.buffer, tenantId);
    return { url };
  }
}

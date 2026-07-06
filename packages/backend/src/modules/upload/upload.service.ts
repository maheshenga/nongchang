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

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function hasValidSignature(mimetype: string, buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (mimetype === 'image/jpeg') return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  if (mimetype === 'image/png') return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimetype === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  return false;
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
    if (!hasValidSignature(file.mimetype, file.buffer)) throw new BadRequestException('文件内容与类型不匹配');

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const folder = purpose === 'credential' ? 'credentials' : 'farm-records';
    const key = `${folder}/${yyyymm}/${randomUUID()}.${ext}`;
    const url = await this.oss.put(key, file.buffer, tenantId);
    return { url };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UploadResponse } from '@nongchang/shared';
import { OssService } from './oss.service';
import {
  buildUploadObjectKey,
  validateUploadFile,
} from './upload.model';
import type { UploadedFile } from './upload.model';

export interface UploadOptions {
  purpose?: 'farm-record' | 'credential' | string;
}

export type { UploadedFile };

@Injectable()
export class UploadService {
  constructor(private oss: OssService) {}

  async upload(file: UploadedFile, tenantId?: string, options: UploadOptions = {}): Promise<UploadResponse> {
    const validation = validateUploadFile({ file, purpose: options.purpose });
    if (!validation.ok) throw new BadRequestException(validation.message);

    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const key = buildUploadObjectKey({
      purpose: validation.purpose,
      yyyymm,
      id: randomUUID(),
      ext: validation.ext,
    });
    const url = await this.oss.put(key, file.buffer, tenantId);
    return { url };
  }
}

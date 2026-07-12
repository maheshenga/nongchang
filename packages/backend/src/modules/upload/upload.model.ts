export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const UPLOAD_ERROR_MESSAGES = {
  missingFile: '未收到文件',
  unsupportedPurpose: '不支持的上传用途',
  farmRecordType: '仅支持 jpg/png/webp 图片',
  credentialType: '仅支持 jpg/png/webp 图片或 PDF',
  tooLarge: '文件不得超过 5MB',
  signatureMismatch: '文件内容与类型不匹配',
} as const;

export type UploadPurpose = 'farm-record' | 'credential' | 'ai-diagnose';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const FARM_RECORD_ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const CREDENTIAL_ALLOWED: Record<string, string> = {
  ...FARM_RECORD_ALLOWED,
  'application/pdf': 'pdf',
};

export type UploadValidationResult =
  | { ok: true; purpose: UploadPurpose; ext: string }
  | { ok: false; message: string };

export function resolveUploadPurpose(rawPurpose?: string): UploadPurpose | null {
  const purpose = rawPurpose ?? 'farm-record';
  return purpose === 'farm-record' || purpose === 'credential' || purpose === 'ai-diagnose' ? purpose : null;
}

export function getAllowedExtension(purpose: UploadPurpose, mimetype: string): string | null {
  return (purpose === 'credential' ? CREDENTIAL_ALLOWED : FARM_RECORD_ALLOWED)[mimetype] ?? null;
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

export function hasValidUploadSignature(mimetype: string, buffer: Buffer): boolean {
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

export function validateUploadFile(input: { file?: UploadedFile | null; purpose?: string }): UploadValidationResult {
  if (!input.file) return { ok: false, message: UPLOAD_ERROR_MESSAGES.missingFile };
  const purpose = resolveUploadPurpose(input.purpose);
  if (!purpose) return { ok: false, message: UPLOAD_ERROR_MESSAGES.unsupportedPurpose };
  const ext = getAllowedExtension(purpose, input.file.mimetype);
  if (!ext) {
    return {
      ok: false,
      message: purpose === 'credential' ? UPLOAD_ERROR_MESSAGES.credentialType : UPLOAD_ERROR_MESSAGES.farmRecordType,
    };
  }
  if (input.file.size > MAX_UPLOAD_SIZE_BYTES) return { ok: false, message: UPLOAD_ERROR_MESSAGES.tooLarge };
  if (!hasValidUploadSignature(input.file.mimetype, input.file.buffer)) {
    return { ok: false, message: UPLOAD_ERROR_MESSAGES.signatureMismatch };
  }
  return { ok: true, purpose, ext };
}

export function buildUploadObjectKey(input: { purpose: UploadPurpose; yyyymm: string; id: string; ext: string }): string {
  const folder = input.purpose === 'credential'
    ? 'credentials'
    : input.purpose === 'ai-diagnose'
      ? 'ai-diagnose'
      : 'farm-records';
  return `${folder}/${input.yyyymm}/${input.id}.${input.ext}`;
}

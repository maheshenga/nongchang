import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_ERROR_MESSAGES,
  buildUploadObjectKey,
  getAllowedExtension,
  hasValidUploadSignature,
  resolveUploadPurpose,
  validateUploadFile,
} from './upload.model';

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpBytes = Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii');
const pdfBytes = Buffer.from('%PDF-1.7\n', 'ascii');

function file(mimetype: string, buffer: Buffer, size = buffer.length) {
  return { originalname: 'file', mimetype, size, buffer };
}

describe('upload model helpers', () => {
  it('keeps upload policy constants stable', () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(UPLOAD_ERROR_MESSAGES.missingFile).toBe('未收到文件');
    expect(UPLOAD_ERROR_MESSAGES.unsupportedPurpose).toBe('不支持的上传用途');
    expect(UPLOAD_ERROR_MESSAGES.farmRecordType).toBe('仅支持 jpg/png/webp 图片');
    expect(UPLOAD_ERROR_MESSAGES.credentialType).toBe('仅支持 jpg/png/webp 图片或 PDF');
    expect(UPLOAD_ERROR_MESSAGES.tooLarge).toBe('文件不得超过 5MB');
    expect(UPLOAD_ERROR_MESSAGES.signatureMismatch).toBe('文件内容与类型不匹配');
  });

  it('normalizes upload purpose with farm-record as default', () => {
    expect(resolveUploadPurpose()).toBe('farm-record');
    expect(resolveUploadPurpose('farm-record')).toBe('farm-record');
    expect(resolveUploadPurpose('credential')).toBe('credential');
    expect(resolveUploadPurpose('ai-diagnose')).toBe('ai-diagnose');
    expect(resolveUploadPurpose('avatar')).toBeNull();
  });

  it('resolves allowed extensions by purpose', () => {
    expect(getAllowedExtension('farm-record', 'image/jpeg')).toBe('jpg');
    expect(getAllowedExtension('farm-record', 'image/png')).toBe('png');
    expect(getAllowedExtension('farm-record', 'image/webp')).toBe('webp');
    expect(getAllowedExtension('farm-record', 'application/pdf')).toBeNull();
    expect(getAllowedExtension('credential', 'application/pdf')).toBe('pdf');
    expect(getAllowedExtension('credential', 'image/jpeg')).toBe('jpg');
    expect(getAllowedExtension('ai-diagnose', 'image/jpeg')).toBe('jpg');
    expect(getAllowedExtension('ai-diagnose', 'application/pdf')).toBeNull();
  });

  it('validates upload signatures for supported binary types', () => {
    expect(hasValidUploadSignature('image/jpeg', jpegBytes)).toBe(true);
    expect(hasValidUploadSignature('image/png', pngBytes)).toBe(true);
    expect(hasValidUploadSignature('image/webp', webpBytes)).toBe(true);
    expect(hasValidUploadSignature('application/pdf', pdfBytes)).toBe(true);
    expect(hasValidUploadSignature('image/png', Buffer.from('not a png'))).toBe(false);
    expect(hasValidUploadSignature('application/pdf', Buffer.from('not a pdf'))).toBe(false);
    expect(hasValidUploadSignature('text/plain', Buffer.from('hello'))).toBe(false);
  });

  it('returns stable validation decisions before OSS writes', () => {
    expect(validateUploadFile({ file: null })).toEqual({ ok: false, message: '未收到文件' });
    expect(validateUploadFile({ file: file('image/jpeg', jpegBytes), purpose: 'avatar' })).toEqual({
      ok: false,
      message: '不支持的上传用途',
    });
    expect(validateUploadFile({ file: file('application/pdf', pdfBytes), purpose: 'farm-record' })).toEqual({
      ok: false,
      message: '仅支持 jpg/png/webp 图片',
    });
    expect(validateUploadFile({ file: file('text/plain', Buffer.from('hello')), purpose: 'credential' })).toEqual({
      ok: false,
      message: '仅支持 jpg/png/webp 图片或 PDF',
    });
    expect(validateUploadFile({ file: file('image/jpeg', jpegBytes, MAX_UPLOAD_SIZE_BYTES + 1) })).toEqual({
      ok: false,
      message: '文件不得超过 5MB',
    });
    expect(validateUploadFile({ file: file('image/png', Buffer.from('not a png')) })).toEqual({
      ok: false,
      message: '文件内容与类型不匹配',
    });
  });

  it('accepts valid farm-record and credential uploads with ext', () => {
    expect(validateUploadFile({ file: file('image/jpeg', jpegBytes) })).toEqual({
      ok: true,
      purpose: 'farm-record',
      ext: 'jpg',
    });
    expect(validateUploadFile({ file: file('application/pdf', pdfBytes), purpose: 'credential' })).toEqual({
      ok: true,
      purpose: 'credential',
      ext: 'pdf',
    });
    expect(validateUploadFile({ file: file('image/jpeg', jpegBytes), purpose: 'ai-diagnose' })).toEqual({
      ok: true,
      purpose: 'ai-diagnose',
      ext: 'jpg',
    });
  });

  it('builds object keys with stable folder and extension rules', () => {
    expect(buildUploadObjectKey({
      tenantId: 'tenant-1',
      purpose: 'farm-record',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000001',
      ext: 'jpg',
    })).toBe('tenants/tenant-1/farm-records/202607/00000000-0000-4000-8000-000000000001.jpg');
    expect(buildUploadObjectKey({
      tenantId: 'tenant-1',
      purpose: 'credential',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000002',
      ext: 'pdf',
    })).toBe('tenants/tenant-1/credentials/202607/00000000-0000-4000-8000-000000000002.pdf');
    expect(buildUploadObjectKey({
      tenantId: 'tenant-1',
      purpose: 'ai-diagnose',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000003',
      ext: 'jpg',
    })).toBe('tenants/tenant-1/ai-diagnose/202607/00000000-0000-4000-8000-000000000003.jpg');
  });
});

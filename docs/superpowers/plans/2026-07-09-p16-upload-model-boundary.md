# P16 Upload Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract upload validation and object-key helpers from `UploadService` so purpose handling, allowed MIME extensions, magic-byte validation, size limits, and storage key generation are directly tested.

**Architecture:** `UploadService` remains responsible for throwing Nest `BadRequestException`, generating UUIDs, reading current time, and calling `OssService.put`. A new `upload.model.ts` owns pure upload policy decisions and key construction with no OSS or Nest side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, Node `Buffer`, existing `@nongchang/shared` upload response type.

## Global Constraints

- Do not change upload controller route, request field name, query parameter, response shape, or `OssService.put` call signature.
- Preserve default upload purpose: missing purpose means `farm-record`.
- Preserve supported purposes: only `farm-record` and `credential`; any other string is rejected with `不支持的上传用途`.
- Preserve max file size: `5 * 1024 * 1024`.
- Preserve farm-record MIME allowlist: `image/jpeg -> jpg`, `image/png -> png`, `image/webp -> webp`.
- Preserve credential MIME allowlist: farm-record allowlist plus `application/pdf -> pdf`.
- Preserve type rejection messages: credential purpose uses `仅支持 jpg/png/webp 图片或 PDF`; farm-record purpose uses `仅支持 jpg/png/webp 图片`.
- Preserve missing file message: `未收到文件`.
- Preserve max-size message: `文件不得超过 5MB`.
- Preserve magic-byte mismatch message: `文件内容与类型不匹配`.
- Preserve signature checks: JPEG starts `[0xff, 0xd8, 0xff]`; PNG starts `[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]`; WebP has `RIFF` at bytes 0-3 and `WEBP` at bytes 8-11; PDF starts `%PDF-`.
- Preserve key format: `farm-records/<yyyymm>/<uuid>.<ext>` for farm records and `credentials/<yyyymm>/<uuid>.<ext>` for credentials.

---

## File Structure

- Create `packages/backend/src/modules/upload/upload.model.ts`
  - Pure helpers for policy constants, purpose normalization, extension lookup, magic-byte validation, upload validation decision, and object key construction.
- Create `packages/backend/src/modules/upload/upload.model.spec.ts`
  - Direct helper tests for validation decisions, signature checks, and key construction.
- Modify `packages/backend/src/modules/upload/upload.service.ts`
  - Replace inline validation/key logic with imports from `upload.model.ts`.

---

### Task 1: Add Upload Model Tests

**Files:**
- Create: `packages/backend/src/modules/upload/upload.model.spec.ts`

**Interfaces:**
- Future exports:
  - `MAX_UPLOAD_SIZE_BYTES`
  - `UPLOAD_ERROR_MESSAGES`
  - `UploadPurpose`
  - `resolveUploadPurpose(rawPurpose?: string): UploadPurpose | null`
  - `getAllowedExtension(purpose: UploadPurpose, mimetype: string): string | null`
  - `hasValidUploadSignature(mimetype: string, buffer: Buffer): boolean`
  - `validateUploadFile(input: { file?: UploadedFile | null; purpose?: string }): { ok: true; purpose: UploadPurpose; ext: string } | { ok: false; message: string }`
  - `buildUploadObjectKey(input: { purpose: UploadPurpose; yyyymm: string; id: string; ext: string }): string`
  - `UploadedFile`

- [ ] **Step 1: Write failing tests**

Use this test file:

```typescript
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
    expect(resolveUploadPurpose('avatar')).toBeNull();
  });

  it('resolves allowed extensions by purpose', () => {
    expect(getAllowedExtension('farm-record', 'image/jpeg')).toBe('jpg');
    expect(getAllowedExtension('farm-record', 'image/png')).toBe('png');
    expect(getAllowedExtension('farm-record', 'image/webp')).toBe('webp');
    expect(getAllowedExtension('farm-record', 'application/pdf')).toBeNull();
    expect(getAllowedExtension('credential', 'application/pdf')).toBe('pdf');
    expect(getAllowedExtension('credential', 'image/jpeg')).toBe('jpg');
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
  });

  it('builds object keys with stable folder and extension rules', () => {
    expect(buildUploadObjectKey({
      purpose: 'farm-record',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000001',
      ext: 'jpg',
    })).toBe('farm-records/202607/00000000-0000-4000-8000-000000000001.jpg');
    expect(buildUploadObjectKey({
      purpose: 'credential',
      yyyymm: '202607',
      id: '00000000-0000-4000-8000-000000000002',
      ext: 'pdf',
    })).toBe('credentials/202607/00000000-0000-4000-8000-000000000002.pdf');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/upload/upload.model.spec.ts
```

Expected: FAIL because `./upload.model` does not exist.

---

### Task 2: Implement Upload Model Helpers

**Files:**
- Create: `packages/backend/src/modules/upload/upload.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Use this implementation:

```typescript
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const UPLOAD_ERROR_MESSAGES = {
  missingFile: '未收到文件',
  unsupportedPurpose: '不支持的上传用途',
  farmRecordType: '仅支持 jpg/png/webp 图片',
  credentialType: '仅支持 jpg/png/webp 图片或 PDF',
  tooLarge: '文件不得超过 5MB',
  signatureMismatch: '文件内容与类型不匹配',
} as const;

export type UploadPurpose = 'farm-record' | 'credential';

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
  return purpose === 'farm-record' || purpose === 'credential' ? purpose : null;
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
  const folder = input.purpose === 'credential' ? 'credentials' : 'farm-records';
  return `${folder}/${input.yyyymm}/${input.id}.${input.ext}`;
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/upload/upload.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire UploadService

**Files:**
- Modify: `packages/backend/src/modules/upload/upload.service.ts`

**Interfaces:**
- Consumes helpers from `./upload.model`.
- Re-exports `UploadOptions` and `UploadedFile` compatibility for controller imports.

- [ ] **Step 1: Replace inline validation and key logic**

Import helpers:

```typescript
import {
  MAX_UPLOAD_SIZE_BYTES,
  buildUploadObjectKey,
  validateUploadFile,
} from './upload.model';
import type { UploadedFile } from './upload.model';
```

Export compatibility types:

```typescript
export interface UploadOptions {
  purpose?: 'farm-record' | 'credential' | string;
}

export type { UploadedFile };
```

Update `upload` method:

```typescript
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
```

Update controller interceptor limit to import or use the same `MAX_UPLOAD_SIZE_BYTES` only if this does not create a circular dependency. If left unchanged, verify value still equals `5 * 1024 * 1024`. Do not change controller behavior.

Remove from service:
- Local `MAX_SIZE`, `ALLOWED`, `CREDENTIAL_ALLOWED`.
- Local `UploadedFile` interface.
- Local `startsWithBytes` and `hasValidSignature`.
- Inline extension, size, signature, folder, and key logic.

- [ ] **Step 2: Run focused upload tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/upload/upload.model.spec.ts src/modules/upload/upload.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify and Review

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run full verification**

Run serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- Build exits `0`.
- Backend unit tests exit `0`.
- `diff --check` exits `0`; LF-to-CRLF warnings are acceptable on Windows if there are no whitespace errors.

- [ ] **Step 2: Review scope**

Review P16 upload model boundary. Ensure no route/request/response/OSS-call behavior changed. Verify purpose defaulting, allowlists, rejection messages, size limit, signature checks, key folders, yyyymm format, UUID extension use, and tenantId forwarding match previous behavior.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p16-upload-model-boundary.md packages/backend/src/modules/upload/upload.model.ts packages/backend/src/modules/upload/upload.model.spec.ts packages/backend/src/modules/upload/upload.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract upload model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers purpose handling, MIME allowlists, message constants, size limit, signature validation, object key generation, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.

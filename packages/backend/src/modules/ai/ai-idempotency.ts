import { BadRequestException } from '@nestjs/common';

const AI_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;

export function requireAiIdempotencyKey(value: string | undefined): string {
  if (!value || !AI_IDEMPOTENCY_KEY.test(value)) {
    throw new BadRequestException('Idempotency-Key 必须为 16 到 128 位安全字符');
  }
  return value;
}

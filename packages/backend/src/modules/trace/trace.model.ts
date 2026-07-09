import { BadRequestException, ForbiddenException } from '@nestjs/common';

export const MAX_CODES_PER_BATCH = 10000;
export const TRACE_GENERATION_REF_TYPE = 'trace.generate' as const;

export interface TraceGenerationKeyInput {
  tenantId: string;
  userId: string;
  batchId: string;
  requestKey: string;
}

export interface TraceCodeCreateDataInput {
  tenantId: string;
  batchId: string;
  codes: readonly string[];
  reservationId: string;
  generationKey: string;
}

export function assertTraceGenerationCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    throw new ForbiddenException(`生成数量须为 1~${MAX_CODES_PER_BATCH} 的整数`);
  }
}

export function normalizeTraceGenerationRequestKey(requestKey?: string): string {
  const normalizedRequestKey = requestKey?.trim();
  if (!normalizedRequestKey) {
    throw new BadRequestException('缺少幂等键,请通过 Idempotency-Key 重试安全地生成溯源码');
  }
  return normalizedRequestKey;
}

export function buildTraceGenerationKey(input: TraceGenerationKeyInput): string {
  return `${TRACE_GENERATION_REF_TYPE}:${input.tenantId}:${input.userId}:${input.batchId}:${input.requestKey}`;
}

export function buildTraceGenerationRef(batchId: string, generationKey: string) {
  return {
    refType: TRACE_GENERATION_REF_TYPE,
    refId: batchId,
    idempotencyKey: generationKey,
  };
}

export function buildTraceCodeLookup(tenantId: string, batchId: string, generationKey: string) {
  return {
    where: { tenantId, batchId, generationKey },
    orderBy: { createdAt: 'asc' as const },
  };
}

export function assertTraceGenerationRetryCount(existingCount: number, requestedCount: number): void {
  if (existingCount !== requestedCount) {
    throw new BadRequestException(`幂等键已用于生成 ${existingCount} 个溯源码,不能以 ${requestedCount} 个重试`);
  }
}

export function buildTraceCodeCreateData(input: TraceCodeCreateDataInput) {
  return input.codes.map((code) => ({
    tenantId: input.tenantId,
    batchId: input.batchId,
    code,
    reservationId: input.reservationId,
    generationKey: input.generationKey,
  }));
}

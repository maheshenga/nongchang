import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AiChatResponse, AiDiagnoseInput, AiDiagnoseResponse, AiTranscribeResponse, AuthUser, AiAdviceInput, AiAskInput } from '@nongchang/shared';
import { AiProviderService, EnabledAiProvider } from '../ai-provider/ai-provider.service';
import { IntegrationConfigService } from '../integration/integration-config.service';
import { BillingService } from '../billing/billing.service';
import { AI_WEIGHT } from '../billing/billing.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { transcribeWithXfyun, WebSocketFactory } from './xfyun-transcribe';
import {
  buildAdviceChatBody,
  buildAiOperationRef,
  buildAskChatBody,
  buildChatCompletionBody,
  buildDiagnoseChatBody,
  type AiOperationKind,
} from './ai.model';

@Injectable()
export class AiService {
  constructor(
    private providers: AiProviderService,
    private integrations: IntegrationConfigService,
    private billing: BillingService,
    private prisma: PrismaService,
    private scope: ScopeService,
  ) {}

  async chat(user: AuthUser, message: string): Promise<AiChatResponse> {
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const body = buildChatCompletionBody(p.textModel, message);
    // Reserve first so insufficient credits fail before starting a paid provider call.
    const ref = this.operationRef('ai.chat', user);
    const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
    return { answer };
  }

  async advice(user: AuthUser, input: AiAdviceInput): Promise<AiChatResponse> {
    await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
    const batch = await this.prisma.batch.findFirst({ where: { id: input.batchId }, select: { cropName: true, status: true, plantDate: true } });
    const records = await this.prisma.farmRecord.findMany({ where: { batchId: input.batchId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true } });
    const phen = await this.prisma.cropPhenology.findMany({ where: { tenantId: user.tenantId, cropName: batch?.cropName }, select: { expectedDays: true } });
    const nowMs = Date.now();
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const ref = this.operationRef('ai.advice', user, input.batchId);
    const body = buildAdviceChatBody(p.textModel, { batch, records, phenology: phen }, nowMs);
    const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
    return { answer };
  }

  async ask(user: AuthUser, input: AiAskInput): Promise<AiChatResponse> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where, select: { batchNo: true, cropName: true, status: true, plantDate: true }, take: 50 });
    const nowMs = Date.now();
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const ref = this.operationRef('ai.ask', user);
    const body = buildAskChatBody(p.textModel, batches, input.question, nowMs);
    const answer = await this.callWithReservation(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
    return { answer };
  }

  async diagnose(user: AuthUser, input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    if (!p.visionModel) throw new BadRequestException('未配置视觉模型');
    const visionModel = p.visionModel;
    const ref = this.operationRef('ai.diagnose', user);
    const result = await this.callWithReservation(user, AI_WEIGHT.diagnose, ref, () => this.callChatCompletions(p, buildDiagnoseChatBody(visionModel, input)));
    return { result };
  }

  async transcribe(user: AuthUser, audio: Buffer, factory?: WebSocketFactory): Promise<AiTranscribeResponse> {
    if (!audio || audio.length === 0) throw new BadRequestException('音频为空');
    const creds = await this.integrations.getEnabledXfyun(user.tenantId);
    if (!creds) throw new BadRequestException('未配置讯飞语音');
    const ref = this.operationRef('ai.transcribe', user);
    const text = await this.callWithReservation(user, AI_WEIGHT.transcribe, ref, async () => {
      try {
        return await transcribeWithXfyun(creds, audio, factory);
      } catch {
        throw new BadGatewayException('语音转写失败');
      }
    });
    return { text };
  }

  private async callWithReservation<T>(user: AuthUser, amount: number, ref: { refType?: string; refId?: string; idempotencyKey?: string }, fn: () => Promise<T>): Promise<T> {
    await this.billing.reserve(user, 'AI', amount, ref);
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      try {
        await this.billing.releaseReservation(user, 'AI', amount, ref);
      } catch {
        // Keep the provider failure as the observable error; unreleased reservations are handled by audit/recovery.
      }
      throw err;
    }
    await this.billing.confirmReservation(user, 'AI', ref);
    return result;
  }

  private operationRef(kind: AiOperationKind, user: AuthUser, refId?: string) {
    const digest = createHash('sha256').update(randomUUID()).digest('hex').slice(0, 16);
    return buildAiOperationRef(kind, user, digest, refId);
  }

  private async callChatCompletions(p: EnabledAiProvider, body: unknown): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new BadGatewayException('AI 服务调用失败');
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      return json.choices[0].message.content;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      // 不泄露 apiKey：仅抛通用网络错误信息
      throw new BadGatewayException('AI 服务调用失败');
    } finally {
      clearTimeout(timer);
    }
  }
}

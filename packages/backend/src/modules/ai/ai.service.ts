import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AiChatResponse, AiDiagnoseInput, AiDiagnoseResponse, AiTranscribeResponse, AuthUser, AiAdviceInput, AiAskInput } from '@nongchang/shared';
import { AiProviderService, EnabledAiProvider } from '../ai-provider/ai-provider.service';
import { IntegrationConfigService } from '../integration/integration-config.service';
import { BillingService } from '../billing/billing.service';
import { AI_WEIGHT } from '../billing/billing.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeService } from '../../common/scope/scope.service';
import { transcribeWithXfyun, WebSocketFactory } from './xfyun-transcribe';

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
    const body = {
      model: p.textModel,
      messages: [{ role: 'user', content: message }],
    };
    // 先扣费(余额不足直接 403,不浪费外部付费调用),外部失败再退款。
    const ref = { refType: 'ai.chat', idempotencyKey: this.idempotencyKey('ai.chat', user, message) };
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, ref);
    const answer = await this.callWithRefund(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, body));
    return { answer };
  }

  async advice(user: AuthUser, input: AiAdviceInput): Promise<AiChatResponse> {
    await this.scope.assertInScope(this.prisma, user, 'batch', input.batchId);
    const batch = await this.prisma.batch.findFirst({ where: { id: input.batchId }, select: { cropName: true, status: true, plantDate: true } });
    const records = await this.prisma.farmRecord.findMany({ where: { batchId: input.batchId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true } });
    const phen = await this.prisma.cropPhenology.findMany({ where: { tenantId: user.tenantId, cropName: batch?.cropName }, select: { expectedDays: true } });
    const totalDays = phen.reduce((s, p) => s + p.expectedDays, 0);
    const elapsed = batch ? Math.floor((Date.now() - new Date(batch.plantDate).getTime()) / 86400000) : 0;
    const prompt = `你是农技专家。作物:${batch?.cropName};当前状态:${batch?.status};已种植${elapsed}天;标准全周期${totalDays || '未知'}天。近期农事:${records.map((r) => r.action).join('、') || '无'}。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。`;
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const ref = { refType: 'ai.advice', refId: input.batchId, idempotencyKey: `ai.advice:${user.tenantId}:${user.userId}:${input.batchId}` };
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, ref);
    const answer = await this.callWithRefund(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, { model: p.textModel, messages: [{ role: 'user', content: prompt }] }));
    return { answer };
  }

  async ask(user: AuthUser, input: AiAskInput): Promise<AiChatResponse> {
    const where = await this.scope.ownedScopeWhere(this.prisma, user);
    const batches = await this.prisma.batch.findMany({ where, select: { batchNo: true, cropName: true, status: true, plantDate: true }, take: 50 });
    const ctx = batches.map((b) => `${b.batchNo}(${b.cropName},${b.status},种植${Math.floor((Date.now() - new Date(b.plantDate).getTime()) / 86400000)}天)`).join(';');
    const prompt = `以下是用户可见的批次数据:${ctx || '无数据'}。请根据数据回答问题:${input.question}`;
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const ref = { refType: 'ai.ask', idempotencyKey: this.idempotencyKey('ai.ask', user, input.question) };
    await this.billing.consume(user, 'AI', AI_WEIGHT.chat, ref);
    const answer = await this.callWithRefund(user, AI_WEIGHT.chat, ref, () => this.callChatCompletions(p, { model: p.textModel, messages: [{ role: 'user', content: prompt }] }));
    return { answer };
  }

  async diagnose(user: AuthUser, input: AiDiagnoseInput): Promise<AiDiagnoseResponse> {
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    if (!p.visionModel) throw new BadRequestException('未配置视觉模型');
    const imgUrl = input.imageUrl ?? ('data:image/jpeg;base64,' + input.imageBase64);
    const body = {
      model: p.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请诊断该作物可能的病害并给出处理建议。' + (input.note ? ' 备注:' + input.note : '') },
            { type: 'image_url', image_url: { url: imgUrl } },
          ],
        },
      ],
    };
    const ref = { refType: 'ai.diagnose', idempotencyKey: this.idempotencyKey('ai.diagnose', user, `${imgUrl}\n${input.note ?? ''}`) };
    await this.billing.consume(user, 'AI', AI_WEIGHT.diagnose, ref);
    const result = await this.callWithRefund(user, AI_WEIGHT.diagnose, ref, () => this.callChatCompletions(p, body));
    return { result };
  }

  async transcribe(user: AuthUser, audio: Buffer, factory?: WebSocketFactory): Promise<AiTranscribeResponse> {
    if (!audio || audio.length === 0) throw new BadRequestException('音频为空');
    const creds = await this.integrations.getEnabledXfyun(user.tenantId);
    if (!creds) throw new BadRequestException('未配置讯飞语音');
    const ref = { refType: 'ai.transcribe', idempotencyKey: this.idempotencyKey('ai.transcribe', user, audio) };
    // consume 在 try 外:余额不足的 403 直接透出,不被降级成 502。
    await this.billing.consume(user, 'AI', AI_WEIGHT.transcribe, ref);
    try {
      const text = await transcribeWithXfyun(creds, audio, factory);
      return { text };
    } catch {
      // 外部失败:退还已扣额度,再统一降级(不泄露凭证)。
      await this.billing.refund(user, 'AI', AI_WEIGHT.transcribe, ref);
      throw new BadGatewayException('语音转写失败');
    }
  }

  // 已扣费后执行外部调用,失败则退款再抛出原错误,避免「扣了费但没拿到结果」。
  private async callWithRefund<T>(user: AuthUser, amount: number, ref: { refType?: string; refId?: string; idempotencyKey?: string }, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      await this.billing.refund(user, 'AI', amount, ref);
      throw err;
    }
  }

  private idempotencyKey(kind: string, user: AuthUser, value: string | Buffer): string {
    const digest = createHash('sha256').update(value).digest('hex').slice(0, 16);
    return `${kind}:${user.tenantId}:${user.userId}:${digest}`;
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

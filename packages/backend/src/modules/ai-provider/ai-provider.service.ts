import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, CreateAiProviderInput, UpdateAiProviderInput, AiProviderView, AiTestResponse } from '@nongchang/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  buildAiProviderCreateData,
  buildAiProviderUpdateData,
  buildAiProviderView,
  buildEnabledAiProvider,
  findEnabledAiProviderRow,
  type AiProviderRow,
  type EnabledAiProvider,
} from './ai-provider.model';

const AI_TEST_TIMEOUT_MS = 10_000;
export type { EnabledAiProvider } from './ai-provider.model';

@Injectable()
export class AiProviderService {
  constructor(private prisma: PrismaService, private enc: EncryptionService) {}

  private toView(r: AiProviderRow): AiProviderView {
    return buildAiProviderView({
      row: r,
      apiKeyMasked: this.enc.maskSecret(this.enc.decrypt(r.apiKeyEnc)),
    });
  }

  async list(user: AuthUser): Promise<AiProviderView[]> {
    const rows = (await this.prisma.aiProvider.findMany({ where: { tenantId: user.tenantId } })) as AiProviderRow[];
    return rows.map((r) => this.toView(r));
  }

  async findOne(user: AuthUser, id: string): Promise<AiProviderView> {
    const row = (await this.prisma.aiProvider.findFirst({ where: { id, tenantId: user.tenantId } })) as AiProviderRow | null;
    if (!row) throw new NotFoundException('AI 服务商不存在');
    return this.toView(row);
  }

  async create(user: AuthUser, dto: CreateAiProviderInput): Promise<AiProviderView> {
    const data = buildAiProviderCreateData({
      tenantId: user.tenantId,
      name: dto.name,
      baseUrl: dto.baseUrl,
      apiKeyEnc: this.enc.encrypt(dto.apiKey),
      textModel: dto.textModel,
      visionModel: dto.visionModel,
      enabled: dto.enabled,
    });
    const row = data.enabled
      ? await this.prisma.$transaction(async (tx) => {
          const db = tx ?? this.prisma;
          await db.aiProvider.updateMany({ where: { tenantId: user.tenantId }, data: { enabled: false } });
          return (await db.aiProvider.create({ data })) as AiProviderRow;
        })
      : ((await this.prisma.aiProvider.create({ data })) as AiProviderRow);
    return this.toView(row);
  }

  async update(user: AuthUser, id: string, dto: UpdateAiProviderInput): Promise<AiProviderView> {
    const existing = (await this.prisma.aiProvider.findFirst({ where: { id, tenantId: user.tenantId } })) as AiProviderRow | null;
    if (!existing) throw new NotFoundException('AI 服务商不存在');

    const { data, finalEnabled } = buildAiProviderUpdateData({
      dto,
      existingEnabled: existing.enabled,
      apiKeyEnc: dto.apiKey ? this.enc.encrypt(dto.apiKey) : null,
    });

    const row = finalEnabled
      ? await this.prisma.$transaction(async (tx) => {
          const db = tx ?? this.prisma;
          await db.aiProvider.updateMany({ where: { tenantId: user.tenantId }, data: { enabled: false } });
          return (await db.aiProvider.update({ where: { id }, data })) as AiProviderRow;
        })
      : ((await this.prisma.aiProvider.update({ where: { id }, data })) as AiProviderRow);
    return this.toView(row);
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const existing = (await this.prisma.aiProvider.findFirst({ where: { id, tenantId: user.tenantId } })) as AiProviderRow | null;
    if (!existing) throw new NotFoundException('AI 服务商不存在');
    await this.prisma.aiProvider.delete({ where: { id } });
    return { ok: true };
  }

  async getEnabled(user: AuthUser): Promise<EnabledAiProvider | null> {
    const rows = (await this.prisma.aiProvider.findMany({ where: { tenantId: user.tenantId } })) as AiProviderRow[];
    const row = findEnabledAiProviderRow(rows);
    if (!row) return null;
    return buildEnabledAiProvider({
      row,
      apiKey: this.enc.decrypt(row.apiKeyEnc),
    });
  }

  async test(user: AuthUser, id: string): Promise<AiTestResponse> {
    const row = (await this.prisma.aiProvider.findFirst({ where: { id, tenantId: user.tenantId } })) as AiProviderRow | null;
    if (!row) throw new NotFoundException('AI 服务商不存在');

    const apiKey = this.enc.decrypt(row.apiKeyEnc);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TEST_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(`${row.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: row.textModel,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) return { ok: false, error: `连接失败(HTTP ${res.status})` };
      return { ok: true, latencyMs };
    } catch {
      // 不泄露 apiKey：仅返回通用文案
      return { ok: false, error: '连接失败' };
    } finally {
      clearTimeout(timer);
    }
  }
}

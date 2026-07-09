import type { AiDiagnoseInput, AuthUser } from '@nongchang/shared';

export type AiOperationKind = 'ai.chat' | 'ai.advice' | 'ai.ask' | 'ai.diagnose' | 'ai.transcribe';

export interface AiOperationRef {
  refType: AiOperationKind;
  refId?: string;
  idempotencyKey: string;
}

export interface ChatCompletionBody {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
}

export interface VisionChatCompletionBody {
  model: string;
  messages: Array<{
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;
  }>;
}

export interface AdvicePromptInput {
  batch: { cropName: string; status: string; plantDate: Date | string } | null;
  records: Array<{ action: string }>;
  phenology: Array<{ expectedDays: number }>;
}

export interface AskBatchSnapshot {
  batchNo: string;
  cropName: string;
  status: string;
  plantDate: Date | string;
}

export function buildAiOperationRef(
  kind: AiOperationKind,
  user: AuthUser,
  digest: string,
  refId?: string,
): AiOperationRef {
  return {
    refType: kind,
    ...(refId ? { refId } : {}),
    idempotencyKey: `${kind}:${user.tenantId}:${user.userId}:${digest}`,
  };
}

export function buildChatCompletionBody(model: string, content: string): ChatCompletionBody {
  return {
    model,
    messages: [{ role: 'user', content }],
  };
}

export function buildAdviceChatBody(model: string, input: AdvicePromptInput, nowMs: number): ChatCompletionBody {
  const totalDays = input.phenology.reduce((s, p) => s + p.expectedDays, 0);
  const elapsed = input.batch
    ? Math.floor((nowMs - new Date(input.batch.plantDate).getTime()) / 86400000)
    : 0;
  const actions = input.records.map((r) => r.action).join('、') || '无';
  const prompt = `你是农技专家。作物:${input.batch?.cropName};当前状态:${input.batch?.status};已种植${elapsed}天;标准全周期${totalDays || '未知'}天。近期农事:${actions}。请给出未来一周的浇水、施肥、病虫害防治建议,简明分点。`;
  return buildChatCompletionBody(model, prompt);
}

export function buildAskChatBody(
  model: string,
  batches: AskBatchSnapshot[],
  question: string,
  nowMs: number,
): ChatCompletionBody {
  const ctx = batches
    .map((b) => `${b.batchNo}(${b.cropName},${b.status},种植${Math.floor((nowMs - new Date(b.plantDate).getTime()) / 86400000)}天)`)
    .join(';');
  return buildChatCompletionBody(model, `以下是用户可见的批次数据:${ctx || '无数据'}。请根据数据回答问题:${question}`);
}

export function buildDiagnoseChatBody(model: string, input: AiDiagnoseInput): VisionChatCompletionBody {
  const imgUrl = input.imageUrl ?? (`data:image/jpeg;base64,${input.imageBase64}`);
  return {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `请诊断该作物可能的病害并给出处理建议。${input.note ? ` 备注:${input.note}` : ''}` },
          { type: 'image_url', image_url: { url: imgUrl } },
        ],
      },
    ],
  };
}

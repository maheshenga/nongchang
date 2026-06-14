import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import type { AiChatResponse, AiDiagnoseInput, AiDiagnoseResponse, AuthUser } from '@nongchang/shared';
import { AiProviderService, EnabledAiProvider } from '../ai-provider/ai-provider.service';

@Injectable()
export class AiService {
  constructor(private providers: AiProviderService) {}

  async chat(user: AuthUser, message: string): Promise<AiChatResponse> {
    const p = await this.providers.getEnabled(user);
    if (!p) throw new BadRequestException('未配置可用的 AI 服务商');
    const body = {
      model: p.textModel,
      messages: [{ role: 'user', content: message }],
    };
    const answer = await this.callChatCompletions(p, body);
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
    const result = await this.callChatCompletions(p, body);
    return { result };
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiAssistant from './AiAssistant';

const aiMocks = vi.hoisted(() => ({
  aiChat: vi.fn(),
  aiDiagnose: vi.fn(),
  aiAdvice: vi.fn(),
  aiAsk: vi.fn(),
}));

const uploadMocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
}));

const batchMocks = vi.hoisted(() => ({
  listBatches: vi.fn(),
}));

const billingMocks = vi.hoisted(() => ({
  getBillingSummary: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  listAiProviders: vi.fn(),
}));

vi.mock('../api/ai', () => aiMocks);
vi.mock('../api/uploads', () => uploadMocks);
vi.mock('../api/batches', () => batchMocks);
vi.mock('../api/billing', () => billingMocks);
vi.mock('../api/ai-provider', () => providerMocks);

const source = (file: string) => readFileSync(join(process.cwd(), 'src/components', file), 'utf8');

describe('AiAssistant Fluent production AI surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiMocks.aiChat.mockResolvedValue({ answer: '问答来自真实 AI 接口' });
    aiMocks.aiDiagnose.mockResolvedValue({ result: '诊断来自真实 AI 接口' });
    aiMocks.aiAdvice.mockResolvedValue({ answer: '农事建议来自真实 AI 接口' });
    aiMocks.aiAsk.mockResolvedValue({ answer: '数据问答来自真实 AI 接口' });
    uploadMocks.uploadImage.mockResolvedValue({ url: 'https://oss.example.test/leaf.jpg' });
    batchMocks.listBatches.mockResolvedValue([
      { id: 'batch-1', batchNo: 'B-001', cropName: '芍药' },
    ]);
    billingMocks.getBillingSummary.mockResolvedValue({
      ownerType: 'MERCHANT', ownerId: 'owner-1', aiBalance: 100, codeBalance: 50,
    });
    providerMocks.listAiProviders.mockResolvedValue([
      {
        id: 'provider-1', name: '生产服务商', baseUrl: 'https://ai.example.test', apiKeyMasked: 'sk-***',
        textModel: 'text-model', visionModel: 'vision-model', enabled: true,
        createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
  });

  it('uses shared Fluent primitives and excludes fake AI output paths', () => {
    const files = ['AiAssistant.tsx', 'AiKnowledgeTask.tsx', 'AiVisionTask.tsx', 'AiAdviceTask.tsx', 'AiDataQa.tsx'];
    const combined = files.map(source).join('\n');

    expect(combined).toContain("from '../ui/fluent'");
    expect(combined).toContain('fluentButton');
    expect(combined).toContain('fluentInput');

    for (const file of files) {
      const text = source(file);

      expect(text).not.toContain('rounded-xl');
      expect(text).not.toContain('rounded-2xl');
      expect(text).not.toContain('bg-emerald-600');
      expect(text).not.toContain('hover:bg-emerald-700');
      expect(text).not.toContain('border-slate');
      expect(text).not.toContain('text-slate');
      expect(text).not.toContain('bg-slate');
      expect(text).not.toContain('setTimeout(() =>');
      expect(text).not.toContain('mockResult');
      expect(text).not.toContain('Simulate AI');
    }
  });

  it('sends trimmed chat text through aiChat and renders the real response', async () => {
    render(<AiAssistant role="merchant_admin" />);

    fireEvent.change(screen.getByPlaceholderText('例如：叶片出现褐色斑点，如何防治？'), {
      target: { value: '  白粉病怎么防治  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提问' }));

    await waitFor(() => expect(aiMocks.aiChat).toHaveBeenCalledWith('白粉病怎么防治'));
    expect(await screen.findByText('问答来自真实 AI 接口')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '本次会话历史' })).getByText('白粉病怎么防治')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '视觉诊断' }));
    expect(screen.getByRole('tabpanel', { name: '视觉诊断' })).toBeTruthy();
    expect(screen.queryByRole('tabpanel', { name: '知识问答' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '知识问答' }));
    expect(screen.getByText('问答来自真实 AI 接口')).toBeTruthy();
  });

  it('uploads an image before diagnosis and passes trimmed optional note', async () => {
    render(<AiAssistant role="merchant_admin" />);
    fireEvent.click(screen.getByRole('tab', { name: '视觉诊断' }));

    const file = new File(['leaf'], 'leaf.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('选择诊断图片'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMocks.uploadImage).toHaveBeenCalledWith(file, 'ai-diagnose'));
    fireEvent.change(screen.getByPlaceholderText('补充说明（可选）'), {
      target: { value: '  叶背有白色粉末  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));

    await waitFor(() => expect(aiMocks.aiDiagnose).toHaveBeenCalledWith({
      imageUrl: 'https://oss.example.test/leaf.jpg',
      note: '叶背有白色粉末',
    }));
    expect(await screen.findByText('诊断来自真实 AI 接口')).toBeTruthy();
  });

  it('asks visible batch data through aiAsk from the embedded data Q&A card', async () => {
    render(<AiAssistant role="merchant_admin" />);
    fireEvent.click(screen.getByRole('tab', { name: '数据问答' }));

    fireEvent.change(screen.getByPlaceholderText('例如：我有哪些批次还在生长期？'), {
      target: { value: '  哪些批次需要浇水  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询数据' }));

    await waitFor(() => expect(aiMocks.aiAsk).toHaveBeenCalledWith({ question: '哪些批次需要浇水' }));
    expect(await screen.findByText('数据问答来自真实 AI 接口')).toBeTruthy();
  });

  it('loads real batches and requests advice for the selected batch', async () => {
    render(<AiAssistant role="merchant_admin" />);
    fireEvent.click(screen.getByRole('tab', { name: '农事建议' }));

    await screen.findByRole('option', { name: 'B-001 · 芍药' });
    fireEvent.change(screen.getByLabelText('选择建议批次'), { target: { value: 'batch-1' } });
    fireEvent.click(screen.getByRole('button', { name: '获取 AI 农事建议' }));

    await waitFor(() => expect(aiMocks.aiAdvice).toHaveBeenCalledWith({ batchId: 'batch-1' }));
    expect(await screen.findByText('农事建议来自真实 AI 接口')).toBeTruthy();
  });

  it('shows real enabled-provider readiness and the current AI balance to system administrators', async () => {
    render(<AiAssistant role="system_admin" />);

    expect(await screen.findByText('服务状态 已配置')).toBeTruthy();
    expect(screen.getByText('AI 额度 100')).toBeTruthy();
    expect(screen.getByText(/成功调用后由后端按实际规则扣减 AI 额度/)).toBeTruthy();
    expect(providerMocks.listAiProviders).toHaveBeenCalledTimes(1);
  });

  it('labels provider readiness as execution-time verification for roles that cannot read provider configuration', async () => {
    render(<AiAssistant role="merchant_admin" />);

    expect(await screen.findByText('服务状态 执行时验证')).toBeTruthy();
    expect(providerMocks.listAiProviders).not.toHaveBeenCalled();
  });

  it('opens the requested batch task and keeps the incoming context visible', async () => {
    render(<AiAssistant role="merchant_admin" context={{ batchId: 'batch-1', task: 'batch' }} />);

    expect(screen.getByRole('tab', { name: '批次诊断' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('当前批次上下文 batch-1')).toBeTruthy();
  });

  it('stops batch diagnosis on quota failure and reports only successful diagnoses', async () => {
    aiMocks.aiDiagnose
      .mockResolvedValueOnce({ result: '第一张诊断成功' })
      .mockRejectedValueOnce(new Error('图像格式无法识别'))
      .mockRejectedValueOnce(new Error('AI 额度不足'));
    uploadMocks.uploadImage
      .mockResolvedValueOnce({ url: 'https://oss.example.test/1.jpg' })
      .mockResolvedValueOnce({ url: 'https://oss.example.test/2.jpg' })
      .mockResolvedValueOnce({ url: 'https://oss.example.test/3.jpg' });
    render(<AiAssistant role="merchant_admin" context={{ task: 'batch' }} />);

    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
      new File(['three'], 'three.jpg', { type: 'image/jpeg' }),
    ];
    fireEvent.change(screen.getByLabelText('选择批量诊断图片'), { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: '批量诊断' }));

    expect(await screen.findByText('已诊断 1 张，额度不足')).toBeTruthy();
    expect(aiMocks.aiDiagnose).toHaveBeenCalledTimes(3);
  });
});

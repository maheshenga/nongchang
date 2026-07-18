import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../api/ai', () => aiMocks);
vi.mock('../api/uploads', () => uploadMocks);
vi.mock('../api/batches', () => batchMocks);

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
  });

  it('uses shared Fluent primitives and excludes fake AI output paths', () => {
    for (const file of ['AiAssistant.tsx', 'AiDataQa.tsx']) {
      const text = source(file);

      expect(text).toContain("from '../ui/fluent'");
      expect(text).toContain('fluentButton');
      expect(text).toContain('fluentInput');
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
    render(<AiAssistant />);

    fireEvent.change(screen.getByPlaceholderText('例如：芍药叶片出现褐色斑点，如何防治？'), {
      target: { value: '  白粉病怎么防治  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提问' }));

    await waitFor(() => expect(aiMocks.aiChat).toHaveBeenCalledWith('白粉病怎么防治'));
    expect(await screen.findByText('问答来自真实 AI 接口')).toBeTruthy();
  });

  it('uploads an image before diagnosis and passes trimmed optional note', async () => {
    render(<AiAssistant />);

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
    render(<AiAssistant />);

    fireEvent.change(screen.getByPlaceholderText('例如：我有哪些批次还在生长期？'), {
      target: { value: '  哪些批次需要浇水  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查询数据' }));

    await waitFor(() => expect(aiMocks.aiAsk).toHaveBeenCalledWith({ question: '哪些批次需要浇水' }));
    expect(await screen.findByText('数据问答来自真实 AI 接口')).toBeTruthy();
  });

  it('loads real batches and requests advice for the selected batch', async () => {
    render(<AiAssistant />);

    await screen.findByRole('option', { name: 'B-001 · 芍药' });
    fireEvent.change(screen.getByLabelText('选择建议批次'), { target: { value: 'batch-1' } });
    fireEvent.click(screen.getByRole('button', { name: '获取 AI 农事建议' }));

    await waitFor(() => expect(aiMocks.aiAdvice).toHaveBeenCalledWith({ batchId: 'batch-1' }));
    expect(await screen.findByText('农事建议来自真实 AI 接口')).toBeTruthy();
  });
});

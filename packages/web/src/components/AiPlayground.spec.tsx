import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aiChatMock = vi.fn();
const aiDiagnoseMock = vi.fn();

vi.mock('../api/ai', () => ({
  aiChat: (...args: unknown[]) => aiChatMock(...args),
  aiDiagnose: (...args: unknown[]) => aiDiagnoseMock(...args),
}));

import AiPlayground from './AiPlayground';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AiPlayground production actions', () => {
  it('sends trimmed chat text to the real chat API wrapper and renders the answer', async () => {
    aiChatMock.mockResolvedValue({ answer: '诊断建议来自接口' });
    render(<AiPlayground />);

    fireEvent.change(screen.getByPlaceholderText('例如：番茄叶片发黄是什么原因？'), { target: { value: '  叶片发黄怎么办  ' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(aiChatMock).toHaveBeenCalledWith('叶片发黄怎么办');
    });
    expect(await screen.findByText('诊断建议来自接口')).toBeTruthy();
  });

  it('renders chat errors from the real chat API wrapper', async () => {
    aiChatMock.mockRejectedValue(new Error('chat failed'));
    render(<AiPlayground />);

    fireEvent.change(screen.getByPlaceholderText('例如：番茄叶片发黄是什么原因？'), { target: { value: 'help' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('chat failed')).toBeTruthy();
  });

  it('sends selected image base64 and trimmed note to the diagnosis API wrapper', async () => {
    class MockFileReader {
      result = 'data:image/png;base64,leaf-image-base64';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      readAsDataURL() {
        this.onload?.();
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);
    aiDiagnoseMock.mockResolvedValue({ result: '病害诊断来自接口' });
    const { container } = render(<AiPlayground />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['leaf'], 'leaf.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByPlaceholderText('例如：症状已持续 3 天'), { target: { value: '  已持续三天  ' } });
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));

    await waitFor(() => {
      expect(aiDiagnoseMock).toHaveBeenCalledWith({ imageBase64: 'leaf-image-base64', note: '已持续三天' });
    });
    expect(await screen.findByText('病害诊断来自接口')).toBeTruthy();
  });

  it('renders diagnosis errors from the diagnosis API wrapper', async () => {
    class MockFileReader {
      result = 'data:image/png;base64,error-image-base64';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      readAsDataURL() {
        this.onload?.();
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);
    aiDiagnoseMock.mockRejectedValue(new Error('diagnosis failed'));
    const { container } = render(<AiPlayground />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['leaf'], 'leaf.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));

    expect(await screen.findByText('diagnosis failed')).toBeTruthy();
  });

  it('explains voice input is not available without showing an inert toolbar action', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<AiPlayground />);

    expect(screen.queryByRole('button', { name: 'Voice input unavailable' })).toBeNull();
    expect(screen.getByText('语音输入暂未开放，请先使用文本提问。')).toBeTruthy();

    expect(alertSpy).not.toHaveBeenCalled();
  });
});

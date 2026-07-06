import { fireEvent, render, screen } from '@testing-library/react';
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
});

describe('AiPlayground production actions', () => {
  it('shows voice input as unavailable without triggering placeholder alerts', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<AiPlayground />);

    const voiceButton = screen.getByRole('button', { name: 'Voice input unavailable' });
    expect((voiceButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(voiceButton);

    expect(alertSpy).not.toHaveBeenCalled();
  });
});

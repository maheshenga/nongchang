import { describe, expect, it } from 'vitest';
import { appendAiHistory, type AiHistoryEntry } from './AiAssistant.model';

const entry = (index: number): AiHistoryEntry => ({
  id: `history-${index}`,
  task: 'knowledge',
  title: `问题 ${index}`,
  result: `回答 ${index}`,
  createdAt: `2026-07-13T00:00:${String(index).padStart(2, '0')}.000Z`,
});

describe('AI assistant retained history', () => {
  it('prepends the newest result without mutating the previous history', () => {
    const previous = [entry(1), entry(0)];
    const next = appendAiHistory(previous, entry(2));

    expect(next.map(item => item.id)).toEqual(['history-2', 'history-1', 'history-0']);
    expect(previous.map(item => item.id)).toEqual(['history-1', 'history-0']);
  });

  it('caps retained results at twenty entries by default', () => {
    const previous = Array.from({ length: 20 }, (_, index) => entry(index));
    const next = appendAiHistory(previous, entry(20));

    expect(next).toHaveLength(20);
    expect(next[0].id).toBe('history-20');
    expect(next.at(-1)?.id).toBe('history-18');
  });
});

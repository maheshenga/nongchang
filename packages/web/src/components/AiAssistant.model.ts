export type AiTaskId = 'knowledge' | 'vision' | 'data' | 'advice' | 'batch';

export interface AiWorkspaceContext {
  batchId?: string;
  fieldId?: string;
  task?: AiTaskId;
}

export interface AiHistoryEntry {
  id: string;
  task: AiTaskId;
  title: string;
  result: string;
  createdAt: string;
}

export function appendAiHistory(
  history: readonly AiHistoryEntry[],
  entry: AiHistoryEntry,
  limit = 20,
): AiHistoryEntry[] {
  return [entry, ...history].slice(0, Math.max(1, limit));
}

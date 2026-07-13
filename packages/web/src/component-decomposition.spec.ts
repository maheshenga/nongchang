import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('large component boundaries', () => {
  it('keeps workspace view routing outside App', () => {
    const app = source('src/App.tsx');
    expect(app).toContain("from './components/AppWorkspaceViews'");
    expect(app.split(/\r?\n/).length).toBeLessThan(340);
  });

  it('keeps batch diagnosis outside AiAssistant orchestration', () => {
    const assistant = source('src/components/AiAssistant.tsx');
    expect(assistant).toContain("from './AiBatchDiagnosisSection'");
    expect(assistant.split(/\r?\n/).length).toBeLessThan(300);
  });
});

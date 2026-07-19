import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(process.cwd(), 'src/pages/trace/index.tsx'), 'utf8');

describe('miniapp trace request freshness gate', () => {
  it('guards event, error and loading state against stale trace requests', () => {
    const text = source();

    expect(text).toContain("import { createLatestRequestGate } from '../../utils/latest-request'");
    expect(text).toContain('setNavigationBarTitle');
    expect(text).toContain('defaultCropName');
    expect(text).toContain('const requestGateRef = useRef(createLatestRequestGate())');
    expect(text).toContain('const requestId = requestGateRef.current.begin()');
    expect(text).toContain('if (!requestGateRef.current.isLatest(requestId)) return');
    expect(text).toContain('if (requestGateRef.current.isLatest(requestId)) setErr');
    expect(text).toContain('if (requestGateRef.current.isLatest(requestId)) setLoading(false)');
    expect(text).toContain('requestGateRef.current.dispose()');
  });
});

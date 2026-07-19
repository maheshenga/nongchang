import { describe, expect, it } from 'vitest';
import { createLatestRequestGate } from './latest-request';

describe('createLatestRequestGate', () => {
  it('accepts only the latest request id', () => {
    const gate = createLatestRequestGate();

    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isLatest(first)).toBe(false);
    expect(gate.isLatest(second)).toBe(true);
  });

  it('rejects every request after disposal', () => {
    const gate = createLatestRequestGate();
    const current = gate.begin();

    gate.dispose();

    expect(gate.isLatest(current)).toBe(false);
    expect(gate.isLatest(gate.begin())).toBe(false);
  });
});

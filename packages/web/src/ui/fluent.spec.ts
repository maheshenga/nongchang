import { describe, expect, it } from 'vitest';
import { fluentButton, fluentInput, fluentStatusTag, fluentTable } from './fluent';

describe('fluent ui helpers', () => {
  it('returns Microsoft blue primary command styles', () => {
    expect(fluentButton('primary')).toContain('bg-[#0078D4]');
    expect(fluentButton('primary')).toContain('text-white');
  });

  it('returns compact input and table styles', () => {
    expect(fluentInput).toContain('h-8');
    expect(fluentTable.wrapper).toContain('border-[#E1DFDD]');
  });

  it('maps status tones to compact tags', () => {
    expect(fluentStatusTag('active')).toContain('bg-[#E5F1FB]');
    expect(fluentStatusTag('danger')).toContain('text-[#A4262C]');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fluentButton, fluentInput, fluentSelect, fluentStatusTag, fluentTable } from './fluent';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));

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

  it('adds centralized mobile touch-target hooks to every interactive helper', () => {
    for (const variant of ['primary', 'secondary', 'subtle', 'danger'] as const) {
      expect(fluentButton(variant)).toContain('fluent-control');
    }
    expect(fluentButton('icon')).toContain('fluent-icon-control');
    expect(fluentInput).toContain('fluent-input-control');
    expect(fluentSelect).toContain('fluent-input-control');
  });

  it('defines 44 pixel minimum targets for mobile and coarse pointers', () => {
    const css = readFileSync(resolve(sourceDirectory, '../index.css'), 'utf8');
    const app = readFileSync(resolve(sourceDirectory, '../App.tsx'), 'utf8');

    expect(css).toContain('(pointer: coarse)');
    expect(css).toContain('(max-width: 767px)');
    expect(css).toMatch(/\.fluent-control[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.fluent-icon-control[\s\S]*min-width:\s*44px/);
    expect(css).toMatch(/\.fluent-input-control[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.mobile-navigation button[\s\S]*min-height:\s*44px/);
    expect(app).toContain('mobile-navigation');
  });
});

import { describe, expect, it } from 'vitest';
import { parseUploadCleanupArgs } from './upload-cleanup.model';

describe('upload cleanup arguments', () => {
  it('defaults to a bounded dry run', () => {
    expect(parseUploadCleanupArgs([])).toEqual({ olderThanMinutes: 60, limit: 100, execute: false });
  });

  it('accepts explicit bounded execution options', () => {
    expect(parseUploadCleanupArgs(['--', '--older-than-minutes', '120', '--limit', '25', '--execute']))
      .toEqual({ olderThanMinutes: 120, limit: 25, execute: true });
  });

  it.each([
    ['--older-than-minutes', '0'],
    ['--limit', '0'],
    ['--limit', '1001'],
    ['--unknown'],
  ])('rejects invalid arguments: %s', (...args) => {
    expect(() => parseUploadCleanupArgs(args as string[])).toThrow();
  });
});

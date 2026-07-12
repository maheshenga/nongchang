import { describe, expect, it } from 'vitest';
import { MULTIPART_FILE_LIMITS } from './upload-limits';

describe('MULTIPART_FILE_LIMITS', () => {
  it('accepts exactly one file and no text fields', () => {
    expect(MULTIPART_FILE_LIMITS).toMatchObject({
      files: 1,
      fields: 0,
      fieldNestingDepth: 1,
    });
  });
});

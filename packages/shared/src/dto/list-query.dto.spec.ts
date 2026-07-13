import { describe, expect, it } from 'vitest';
import { listQuerySchema } from './list-query.dto';

describe('listQuerySchema search', () => {
  it('trims a bounded server-side search term', () => {
    expect(listQuerySchema.parse({ search: '  稻谷  ', page: '1', pageSize: '50' })).toEqual({
      search: '稻谷',
      page: 1,
      pageSize: 50,
    });
  });

  it('rejects search terms longer than 100 characters after trimming', () => {
    expect(() => listQuerySchema.parse({ search: `  ${'a'.repeat(101)}  ` })).toThrow();
  });
});

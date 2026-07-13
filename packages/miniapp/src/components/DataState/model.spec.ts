import { describe, expect, it } from 'vitest';
import { errorResource, loadingResource, successResource } from './model';

describe('miniapp async resource state', () => {
  it('preserves previously loaded data while refreshing or reporting an error', () => {
    const previous = successResource(['old']);

    expect(loadingResource(previous)).toEqual({
      status: 'loading',
      data: ['old'],
      error: null,
    });
    expect(errorResource(previous, '加载失败')).toEqual({
      status: 'error',
      data: ['old'],
      error: '加载失败',
    });
  });
});

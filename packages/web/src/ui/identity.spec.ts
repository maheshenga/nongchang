import { describe, expect, it } from 'vitest';
import { buildIdentityMap, friendlyIdentity } from './identity';

describe('friendly identity boundary', () => {
  it('uses the business label while retaining a short diagnostic id', () => {
    expect(friendlyIdentity({
      id: 'field-abcdef1234',
      label: ' 东区一号田 ',
      fallback: '未知地块',
    })).toEqual({
      label: '东区一号田',
      technicalId: 'field-abcdef1234',
      shortId: 'field-ab',
      isFallback: false,
    });
  });

  it('uses a neutral fallback without promoting the technical id', () => {
    expect(friendlyIdentity({
      id: 'field-abcdef1234',
      label: null,
      fallback: '未知地块',
    })).toEqual({
      label: '未知地块',
      technicalId: 'field-abcdef1234',
      shortId: 'field-ab',
      isFallback: true,
    });
  });

  it('builds trimmed label maps for related entities', () => {
    const map = buildIdentityMap(
      [{ id: 'field-1', name: ' 北区 ' }, { id: 'field-2', name: null }],
      item => item.id,
      item => item.name,
    );

    expect([...map.entries()]).toEqual([['field-1', '北区'], ['field-2', '']]);
  });
});

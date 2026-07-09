import { describe, expect, it } from 'vitest';
import {
  buildQuickTemplateCreateData,
  buildQuickTemplateTenantWhere,
  buildQuickTemplateUpdateData,
  buildQuickTemplateView,
  type QuickTemplateRow,
} from './quick-template.model';

const row: QuickTemplateRow = {
  id: 'qt1',
  tenantId: 't1',
  name: '浇水模板',
  action: '浇水',
  note: null,
  cost: null,
  labor: null,
  sort: 0,
  createdAt: new Date('2026-06-14T10:00:00.000Z'),
};

describe('quick-template.model', () => {
  it('serializes a row to the shared view contract', () => {
    expect(buildQuickTemplateView(row)).toEqual({
      id: 'qt1',
      name: '浇水模板',
      action: '浇水',
      note: null,
      cost: null,
      labor: null,
      sort: 0,
      createdAt: '2026-06-14T10:00:00.000Z',
    });
  });

  it('builds create data with nullable defaults', () => {
    expect(buildQuickTemplateCreateData({
      tenantId: 't1',
      dto: { name: '浇水模板', action: '浇水' },
    })).toEqual({
      tenantId: 't1',
      name: '浇水模板',
      action: '浇水',
      note: null,
      cost: null,
      labor: null,
      sort: 0,
    });
  });

  it('builds create data preserving optional values', () => {
    expect(buildQuickTemplateCreateData({
      tenantId: 't1',
      dto: { name: '追肥模板', action: '施肥', note: '尿素', cost: 50, labor: 1, sort: 3 },
    })).toMatchObject({ note: '尿素', cost: 50, labor: 1, sort: 3 });
  });

  it('builds update data only for provided fields', () => {
    expect(buildQuickTemplateUpdateData({ name: 'A2', action: '滴灌', note: '改' })).toEqual({
      name: 'A2',
      action: '滴灌',
      note: '改',
    });
  });

  it('builds tenant where with optional id', () => {
    expect(buildQuickTemplateTenantWhere({ tenantId: 't1' })).toEqual({ tenantId: 't1' });
    expect(buildQuickTemplateTenantWhere({ tenantId: 't1', id: 'qt1' })).toEqual({ tenantId: 't1', id: 'qt1' });
    expect(buildQuickTemplateTenantWhere({ tenantId: 't1', id: '' })).toEqual({ tenantId: 't1', id: '' });
  });
});

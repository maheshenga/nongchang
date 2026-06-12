import { describe, it, expect } from 'vitest';
import { ScopeService } from './scope.service';
import { Role } from '@nongchang/shared';

const svc = new ScopeService();
const ctx = (over: Partial<any>) => ({ userId: 'u', tenantId: 't1', role: Role.MERCHANT, agentId: null, ownerId: null, ...over });

describe('ScopeService.ownedWhere', () => {
  it('system_admin 仅按 tenantId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.SYSTEM_ADMIN, ownerId: null }))).toEqual({ tenantId: 't1' });
  });
  it('agent_admin 按 tenantId + agentId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.AGENT_ADMIN, agentId: 'a1' }))).toEqual({ tenantId: 't1', agentId: 'a1' });
  });
  it('merchant 按 tenantId + ownerId 过滤', () => {
    expect(svc.ownedWhere(ctx({ role: Role.MERCHANT, ownerId: 'm1' }))).toEqual({ tenantId: 't1', ownerId: 'm1' });
  });
});

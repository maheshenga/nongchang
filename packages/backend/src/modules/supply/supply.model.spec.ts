import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_SUPPLY_LIST_CAP,
  LOW_STOCK_THRESHOLD,
  buildSupplyCreateData,
  buildSupplyIssueCreateData,
  buildSupplyIssueUpdate,
  toSupplyIssueResponse,
  toSupplyItem,
} from './supply.model';

describe('supply model helpers', () => {
  it('keeps list cap and low-stock threshold stable', () => {
    expect(DEFAULT_SUPPLY_LIST_CAP).toBe(500);
    expect(LOW_STOCK_THRESHOLD).toBe(10);
  });

  it('projects supply rows with numeric Decimal fields and ISO createdAt', () => {
    const item = toSupplyItem({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: new Prisma.Decimal('100.5'),
      used: new Prisma.Decimal('95.25'),
      createdAt: new Date('2026-06-14T10:00:00.000Z'),
    });

    expect(item).toEqual({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: 100.5,
      used: 95.25,
      remaining: 5.25,
      alert: true,
      createdAt: '2026-06-14T10:00:00.000Z',
    });
  });

  it('does not alert when remaining equals the threshold', () => {
    const item = toSupplyItem({
      id: 's1',
      name: 'Fertilizer',
      unit: 'bag',
      total: new Prisma.Decimal(100),
      used: new Prisma.Decimal(90),
      createdAt: new Date('2026-06-14T10:00:00.000Z'),
    });

    expect(item.remaining).toBe(10);
    expect(item.alert).toBe(false);
  });

  it('builds supply create data with owner and zero used amount', () => {
    expect(buildSupplyCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      input: { name: 'Seed', unit: 'kg', amount: 50 },
    })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      name: 'Seed',
      unit: 'kg',
      total: 50,
      used: 0,
    });
  });

  it('builds conditional issue update with Decimal-safe remaining guard', () => {
    const update = buildSupplyIssueUpdate({ supplyId: 's1', total: new Prisma.Decimal('100.5'), amount: 30 });

    expect(update.data).toEqual({ used: { increment: 30 } });
    expect(update.where.id).toBe('s1');
    expect(update.where.used.lte).toBeInstanceOf(Prisma.Decimal);
    expect(update.where.used.lte.toString()).toBe('70.5');
  });

  it('builds issue ledger data and defaults unitPrice to zero', () => {
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30 },
    })).toEqual({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      amount: 30,
      unitPrice: 0,
    });
  });

  it('preserves explicit issue unitPrice zero and positive values', () => {
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30, unitPrice: 0 },
    }).unitPrice).toBe(0);
    expect(buildSupplyIssueCreateData({
      tenantId: 't1',
      ownerId: 'm1',
      supplyId: 's1',
      batchId: 'b1',
      issue: { batchId: 'b1', amount: 30, unitPrice: 2.5 },
    }).unitPrice).toBe(2.5);
  });

  it('builds issue response with numeric used and remaining values', () => {
    expect(toSupplyIssueResponse('s1', {
      total: new Prisma.Decimal(100),
      used: new Prisma.Decimal(45.5),
    })).toEqual({ supplyId: 's1', used: 45.5, remaining: 54.5 });
  });
});

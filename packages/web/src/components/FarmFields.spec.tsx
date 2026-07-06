import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nongchang/shared';

const listFieldsMock = vi.fn();
const createFieldMock = vi.fn();
const listMerchantsMock = vi.fn();
let authUser: AuthUser | null = null;
let mapFieldNames: string[] = [];

vi.mock('../api/fields', () => ({
  listFields: () => listFieldsMock(),
  createField: (...args: unknown[]) => createFieldMock(...args),
}));

vi.mock('../api/agents', () => ({
  listMerchants: () => listMerchantsMock(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: () => ({ user: authUser }),
}));

vi.mock('./TiandituMap', () => ({
  default: ({ fields, onSelect }: { fields: Array<{ id: string; name: string }>; onSelect: (id: string) => void }) => {
    mapFieldNames = fields.map((field) => field.name);
    return (
      <div data-testid="tianditu-map">
        {fields.map((field) => (
          <button key={field.id} type="button" onClick={() => onSelect(field.id)}>
            map-{field.name}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('./TiandituPicker', () => ({
  default: ({ onPick }: { onPick: (lng: number, lat: number) => void }) => (
    <button type="button" onClick={() => onPick(120.12, 30.16)}>pick-location</button>
  ),
}));

import FarmFields from './FarmFields';

const fields = [
  { id: 'field-1', tenantId: 't1', ownerId: 'owner-1', ownerName: 'Owner A', name: 'North Field', area: 12.5, lng: 120.1, lat: 30.1, iotDeviceId: 'iot-1', createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 'field-2', tenantId: 't1', ownerId: 'owner-2', ownerName: 'Owner B', name: 'South Field', area: 8, lng: null, lat: null, iotDeviceId: null, createdAt: '2026-07-02T00:00:00.000Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mapFieldNames = [];
  authUser = { userId: 'admin-1', tenantId: 't1', role: 'system_admin', agentId: null, ownerId: null };
  listFieldsMock.mockResolvedValue(fields);
  createFieldMock.mockResolvedValue(fields[0]);
  listMerchantsMock.mockResolvedValue([{ id: 'owner-1', username: 'merchant-a', displayName: 'Owner A' }]);
});

describe('FarmFields Fluent workspace', () => {
  it('filters the field list while keeping the real map surface fed with all fields', async () => {
    render(<FarmFields />);
    await screen.findByText('North Field');

    expect(screen.getByRole('heading', { name: '数字地块管理' })).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索地块...')).toBeTruthy();
    expect(screen.getByTestId('tianditu-map')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索地块...'), { target: { value: 'South' } });

    expect(screen.queryByText('North Field')).toBeNull();
    expect(screen.getByText('South Field')).toBeTruthy();
    expect(mapFieldNames).toEqual(['North Field', 'South Field']);
  });

  it('opens create dialog and submits the real createField payload', async () => {
    render(<FarmFields />);
    await screen.findByText('North Field');

    fireEvent.click(screen.getByRole('button', { name: /绘制新地块/ }));
    await screen.findByRole('option', { name: 'Owner A (merchant-a)' });
    fireEvent.change(screen.getByLabelText('归属商家'), { target: { value: 'owner-1' } });
    fireEvent.change(screen.getByLabelText('地块名称'), { target: { value: 'East Field' } });
    fireEvent.change(screen.getByLabelText('面积(亩)'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByText('pick-location'));
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createFieldMock).toHaveBeenCalledWith({
        ownerId: 'owner-1',
        name: 'East Field',
        area: 3.5,
        lng: 120.12,
        lat: 30.16,
      });
    });
    expect(listFieldsMock).toHaveBeenCalledTimes(2);
  });

  it('uses the merchant owner id without exposing the owner selector', async () => {
    authUser = { userId: 'merchant-user', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'merchant-owner' };
    render(<FarmFields />);
    await screen.findByText('North Field');

    fireEvent.click(screen.getByRole('button', { name: /绘制新地块/ }));
    expect(screen.queryByLabelText('归属商家')).toBeNull();

    fireEvent.change(screen.getByLabelText('地块名称'), { target: { value: 'Merchant Field' } });
    fireEvent.change(screen.getByLabelText('面积(亩)'), { target: { value: '6' } });
    fireEvent.click(screen.getByText('pick-location'));
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createFieldMock).toHaveBeenCalledWith({
        ownerId: 'merchant-owner',
        name: 'Merchant Field',
        area: 6,
        lng: 120.12,
        lat: 30.16,
      });
    });
  });
});

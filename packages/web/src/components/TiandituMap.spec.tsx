import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TiandituMap from './TiandituMap';

const loadTiandituMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/tianditu', () => ({ loadTianditu: loadTiandituMock }));

describe('TiandituMap recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadTiandituMock.mockRejectedValue(new Error('未配置或未启用天地图'));
  });

  it('renders the role-permitted recovery action', async () => {
    const onAction = vi.fn();
    render(
      <TiandituMap
        fields={[]}
        activeFieldId={null}
        onSelect={vi.fn()}
        recovery={{ message: '请配置天地图', actionLabel: '前往第三方集成', onAction }}
      />,
    );

    await waitFor(() => expect(screen.getByText('请配置天地图')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '前往第三方集成' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders guidance without an inaccessible action', async () => {
    render(
      <TiandituMap
        fields={[]}
        activeFieldId={null}
        onSelect={vi.fn()}
        recovery={{ message: '请联系租户系统管理员配置天地图' }}
      />,
    );

    await waitFor(() => expect(screen.getByText('请联系租户系统管理员配置天地图')).toBeTruthy());
    expect(screen.queryByRole('button', { name: '前往第三方集成' })).toBeNull();
  });
});

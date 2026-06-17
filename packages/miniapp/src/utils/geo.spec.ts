import { describe, it, expect } from 'vitest';
import { wgs84ToGcj02 } from './geo';

describe('wgs84ToGcj02', () => {
  it('中国境内坐标产生非零偏移(数百米量级)', () => {
    // 天安门 WGS84 约 116.3912,39.9067
    const { lng, lat } = wgs84ToGcj02(116.3912, 39.9067);
    expect(lng).not.toBe(116.3912);
    expect(lat).not.toBe(39.9067);
    // 偏移在合理范围:经纬度各约 0.001~0.01 度
    expect(Math.abs(lng - 116.3912)).toBeGreaterThan(0.001);
    expect(Math.abs(lng - 116.3912)).toBeLessThan(0.02);
    expect(Math.abs(lat - 39.9067)).toBeGreaterThan(0.0005);
    expect(Math.abs(lat - 39.9067)).toBeLessThan(0.02);
  });

  it('境外坐标原样返回(不加密)', () => {
    const r = wgs84ToGcj02(139.767, 35.681); // 东京
    expect(r.lng).toBe(139.767);
    expect(r.lat).toBe(35.681);
  });
});

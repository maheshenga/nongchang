import { describe, it, expect } from 'vitest';
import { resolveClientIp } from './client-ip';

describe('resolveClientIp(信任反代跳数从 XFF 右端取真实客户端 IP)', () => {
  // 宝塔 Nginx 单层反代:$proxy_add_x_forwarded_for 把"Nginx 看到的真实 remote_addr"
  // append 到 XFF 末尾,故信任 1 跳时可信客户端 IP = XFF 倒数第 1 段。
  it('hops=1:取 XFF 最右段(可信),忽略客户端伪造的左侧段', () => {
    // 客户端伪造了 1.1.1.1,Nginx 追加了真实的 203.0.113.9
    const ip = resolveClientIp('1.1.1.1, 203.0.113.9', '10.0.0.1', 1);
    expect(ip).toBe('203.0.113.9');
  });

  it('hops=1 且 XFF 仅一段:取该段', () => {
    expect(resolveClientIp('203.0.113.9', '10.0.0.1', 1)).toBe('203.0.113.9');
  });

  it('hops=0:完全不信任 XFF,用 socket remoteAddress', () => {
    expect(resolveClientIp('1.1.1.1, 2.2.2.2', '10.0.0.1', 0)).toBe('10.0.0.1');
  });

  it('hops=2:取 XFF 倒数第 2 段', () => {
    const ip = resolveClientIp('1.1.1.1, 203.0.113.9, 198.51.100.7', '10.0.0.1', 2);
    expect(ip).toBe('203.0.113.9');
  });

  it('XFF 缺失:退回 socket remoteAddress', () => {
    expect(resolveClientIp(undefined, '10.0.0.1', 1)).toBe('10.0.0.1');
  });

  it('XFF 段数不足 hops:退回 socket remoteAddress(防伪造截断)', () => {
    // 只有 1 段但要信任 2 跳 → 不足以确定可信段,退回 socket
    expect(resolveClientIp('203.0.113.9', '10.0.0.1', 2)).toBe('10.0.0.1');
  });

  it('XFF 为数组(多个 header):合并后按右端取', () => {
    expect(resolveClientIp(['1.1.1.1', '203.0.113.9'], '10.0.0.1', 1)).toBe('203.0.113.9');
  });

  it('全部缺失:返回 unknown', () => {
    expect(resolveClientIp(undefined, undefined, 1)).toBe('unknown');
  });

  it('去除段内空白', () => {
    expect(resolveClientIp(' 1.1.1.1 ,  203.0.113.9 ', '10.0.0.1', 1)).toBe('203.0.113.9');
  });
});

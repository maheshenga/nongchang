/**
 * 从 X-Forwarded-For 解析可信的客户端真实 IP。
 *
 * 背景:XFF 由客户端任意构造,直接取最左段会被伪造("多地扫码"误报/单 IP 去重绕过)。
 * 可信做法是按可信反代跳数从 XFF **右端**回溯:每经一层我方可信反代(如宝塔 Nginx,
 * 其 `$proxy_add_x_forwarded_for` 会把它看到的 remote_addr append 到 XFF 末尾),
 * XFF 末尾就多一段可信值。信任 N 跳即取倒数第 N 段。
 *
 * @param xff       请求头 x-forwarded-for(可能为 undefined / string / string[])
 * @param remoteAddr socket 连接 IP(我方反代到 Node 的连接地址)
 * @param trustHops 可信反代跳数(宝塔单层=1;无反代直连=0)
 * @returns 可信客户端 IP;无法可信确定时退回 remoteAddr;再无则 'unknown'
 */
export function resolveClientIp(
  xff: string | string[] | undefined,
  remoteAddr: string | undefined,
  trustHops: number,
): string {
  const fallback = remoteAddr ?? 'unknown';
  // 不信任 XFF(直连)或无跳数:直接用 socket 地址
  if (trustHops <= 0) return fallback;

  const merged = Array.isArray(xff) ? xff.join(',') : xff;
  if (!merged) return fallback;

  const parts = merged.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  // 段数不足以覆盖可信跳数 → 无法确定可信段,退回 socket(防客户端截断伪造)
  if (parts.length < trustHops) return fallback;

  // 倒数第 trustHops 段为最外层可信反代之前的客户端 IP
  return parts[parts.length - trustHops];
}

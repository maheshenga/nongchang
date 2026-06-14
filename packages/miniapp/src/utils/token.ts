// 极简 base64 解码（weapp 无 atob），用于解出 JWT payload。
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Decode(input: string): string {
  const str = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    if (ch === '=') break;
    const idx = B64.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

export interface TokenPayload {
  username?: string;
  role?: string;
  tenantId?: string;
  [k: string]: unknown;
}

export function decodeToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = decodeURIComponent(
      base64Decode(parts[1])
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<string, string> = {
  system_admin: '系统管理员',
  agent_admin: '代理商',
  merchant: '商家主理人',
};

export function roleLabel(role?: string): string {
  return (role && ROLE_LABEL[role]) || '农技员';
}

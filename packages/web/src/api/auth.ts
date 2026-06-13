import type { LoginDto, TokenPair } from '@nongchang/shared';

export async function login(dto: LoginDto): Promise<TokenPair> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    let message = '账号或密码错误';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return (await res.json()) as TokenPair;
}

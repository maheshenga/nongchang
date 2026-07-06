import type { HelmetOptions } from 'helmet';

interface HelmetConfigInput {
  ossBaseUrl?: string;
}

function originOf(raw?: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function buildHelmetOptions(input: HelmetConfigInput = {}): HelmetOptions {
  const ossOrigin = originOf(input.ossBaseUrl ?? process.env.OSS_BASE_URL);

  return {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: uniq(["'self'", 'data:', 'blob:', ossOrigin, 'https://*.tianditu.gov.cn']),
        scriptSrc: ["'self'", 'https://api.tianditu.gov.cn', 'https://*.tianditu.gov.cn'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        connectSrc: uniq(["'self'", ossOrigin, 'https://api.tianditu.gov.cn', 'https://*.tianditu.gov.cn']),
        formAction: ["'self'", 'https://alipay.com', 'https://*.alipay.com', 'https://alipaydev.com', 'https://*.alipaydev.com'],
      },
    },
  };
}

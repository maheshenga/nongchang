import { describe, expect, it } from 'vitest';
import { resolveProductionWebEnv } from './production-env';

describe('resolveProductionWebEnv', () => {
  it.each([
    {},
    { VITE_PUBLIC_SALES_CONTACT: '' },
    { VITE_PUBLIC_SALES_CONTACT: '   ' },
    { VITE_PUBLIC_SALES_CONTACT: 'undefined' },
  ])('rejects a missing public sales contact %#', (env) => {
    expect(() => resolveProductionWebEnv(env)).toThrow('VITE_PUBLIC_SALES_CONTACT');
  });

  it('returns a trimmed public sales contact', () => {
    expect(resolveProductionWebEnv({
      VITE_PUBLIC_SALES_CONTACT: ' sales@example.com ',
    })).toEqual({ salesContact: 'sales@example.com' });
  });
});

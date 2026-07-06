import { describe, expect, it } from 'vitest';
import { Permission, userGroupInputSchema } from '@nongchang/shared';

describe('userGroupInputSchema permissions', () => {
  it('accepts every exported enforced permission value', () => {
    const parsed = userGroupInputSchema.parse({
      name: 'operators',
      permissions: Object.values(Permission),
    });

    expect(parsed.permissions).toEqual(Object.values(Permission));
  });

  it('rejects unknown permission strings before they can be stored', () => {
    const parsed = userGroupInputSchema.safeParse({
      name: 'operators',
      permissions: [Permission.RECORD_CREATE, 'billing:delete'],
    });

    expect(parsed.success).toBe(false);
  });

  it('keeps permissions optional for create and update payloads', () => {
    const parsed = userGroupInputSchema.parse({ name: 'operators' });

    expect(parsed).toEqual({ name: 'operators' });
  });
});

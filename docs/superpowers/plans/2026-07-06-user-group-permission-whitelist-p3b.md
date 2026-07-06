# User Group Permission Whitelist P3B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent user-group create/update APIs from accepting arbitrary permission strings that are not enforced by `PermissionsGuard`.

**Architecture:** Keep the existing permission model and guard behavior. Tighten the shared input schema so `permissions` can only contain values from the exported `Permission` constants, while leaving persisted/view data as string arrays for backward compatibility with any existing rows. Add backend-side schema regression tests because the backend controller uses the shared schema through `ZodValidationPipe`.

**Tech Stack:** TypeScript, Zod, NestJS/Vitest, pnpm workspace.

---

## File Structure

- Modify `packages/shared/src/dto/integration.dto.ts`
  - Import `Permission` and its type from `../enums`.
  - Add a `userGroupPermissionSchema` enum built from the known permission constants.
  - Change `userGroupInputSchema.permissions` from `z.array(z.string())` to `z.array(userGroupPermissionSchema)`.
  - Keep `userGroupViewSchema.permissions` as `z.array(z.string())` to avoid breaking reads of older dirty data.
- Create `packages/backend/src/modules/user-group/user-group.schema.spec.ts`
  - Prove every exported `Permission` value is accepted by `userGroupInputSchema`.
  - Prove an unknown string such as `billing:delete` is rejected.
  - Prove omitted `permissions` still parses for existing create/update flows.
- Modify `packages/web/src/components/UserGroups.tsx`
  - Keep selected permissions typed as the shared `Permission` union so create/update payloads satisfy the narrowed `UserGroupInput`.
  - Filter unknown permissions out of older dirty rows when opening the edit modal, so they are not re-submitted.
- No Prisma migration.

---

### Task 1: Shared Schema Permission Whitelist

**Files:**
- Create: `packages/backend/src/modules/user-group/user-group.schema.spec.ts`
- Modify: `packages/shared/src/dto/integration.dto.ts`

- [ ] **Step 1: Write failing schema tests**

Create `packages/backend/src/modules/user-group/user-group.schema.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.schema.spec.ts
```

Expected: FAIL because `billing:delete` is currently accepted by `z.array(z.string())`.

- [ ] **Step 3: Implement the shared schema whitelist**

In `packages/shared/src/dto/integration.dto.ts`, add the import:

```ts
import { Permission, type Permission as PermissionValue } from '../enums';
```

Add this constant above `userGroupInputSchema`:

```ts
const userGroupPermissionValues = Object.values(Permission) as [PermissionValue, ...PermissionValue[]];
export const userGroupPermissionSchema = z.enum(userGroupPermissionValues);
```

Change `userGroupInputSchema` to:

```ts
export const userGroupInputSchema = z.object({
  name: z.string().min(1).max(64),
  isDefault: z.boolean().optional(),
  permissions: z.array(userGroupPermissionSchema).optional(),
});
```

Do not change `userGroupViewSchema` in this task.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.schema.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run type checks that cover shared + web usage**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/shared build
corepack pnpm@10.33.2 --filter web exec tsc --noEmit
```

Expected: PASS. If web typecheck fails because literals are inferred as `string[]`, fix the source by importing `Permission` or adding precise literal typing at the call site rather than widening the shared schema again.

---

### Task 2: Web Call-Site Type Adaptation

**Files:**
- Modify: `packages/web/src/components/UserGroups.tsx`

- [x] **Step 1: Run typecheck to reproduce the failure**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec tsc --noEmit
```

Expected before the fix: FAIL with `Type 'string[]' is not assignable to type 'Permission[]'` at the `UserGroupInput` payload construction.

- [x] **Step 2: Narrow selected permission state**

In `packages/web/src/components/UserGroups.tsx`, import the shared permission type:

```ts
import { Permission, type Permission as PermissionValue, type UserGroupView, type UserGroupInput } from '@nongchang/shared';
```

Type local options/state with `PermissionValue`:

```ts
const PERMISSION_OPTIONS: { value: PermissionValue; label: string }[] = [
  { value: Permission.RECORD_CREATE, label: '创建农事记录' },
  { value: Permission.RECORD_VIEW, label: '查看农事记录' },
  { value: Permission.TRACE_VIEW, label: '查看溯源' },
  { value: Permission.BATCH_VIEW, label: '查看批次' },
  { value: Permission.FIELD_VIEW, label: '查看地块' },
];

interface EditState {
  id: string | null;
  name: string;
  isDefault: boolean;
  permissions: PermissionValue[];
}
```

When editing an existing group, filter older dirty permission strings:

```ts
permissions: g.permissions.filter((permission): permission is PermissionValue =>
  Object.values(Permission).includes(permission as PermissionValue),
),
```

- [x] **Step 3: Run typecheck and UserGroups test**

Run:

```bash
corepack pnpm@10.33.2 --filter web exec tsc --noEmit
corepack pnpm@10.33.2 --filter web exec vitest run src/components/UserGroups.spec.tsx
```

Expected: PASS.

---

### Task 3: Review and Verification

**Files:**
- Modified files from Tasks 1-2.

- [ ] **Step 1: Run focused backend user-group tests**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user-group/user-group.schema.spec.ts src/modules/user-group/user-group.service.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run local verification gate**

Run:

```bash
corepack pnpm@10.33.2 verify:local
```

Expected: PASS.

- [ ] **Step 3: Run e2e DB precheck**

Run:

```bash
corepack pnpm@10.33.2 --filter @nongchang/backend e2e:check-db
```

Expected in the current environment if PostGIS is still down: FAIL with `Cannot reach PostgreSQL/PostGIS at 127.0.0.1:5544`. Do not claim e2e passes unless the database is reachable and the e2e suite exits 0.

- [ ] **Step 4: Request code review**

Review requirements:

```text
Review P3B user-group permission whitelist.
The user-group create/update input schema must accept only exported Permission values.
Existing valid Permission values must still parse.
Omitted permissions must remain valid.
Read/view schema should not reject older persisted dirty rows unless the implementation intentionally includes a data cleanup migration.
No new permission semantics or route guard behavior should be added in this slice.
```

- [ ] **Step 5: Commit**

After review issues are resolved and verification evidence is recorded:

```bash
git add packages/shared/src/dto/integration.dto.ts packages/backend/src/modules/user-group/user-group.schema.spec.ts docs/superpowers/plans/2026-07-06-user-group-permission-whitelist-p3b.md
git commit -m "fix(authz): validate user group permissions"
```

---

## Self-Review

- Spec coverage: This closes the reviewed P3/P6 low-priority gap where arbitrary permission strings could be stored while the guard only recognizes known `Permission` values.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: The schema uses the existing `Permission` constants from `packages/shared/src/enums/index.ts`; no duplicate permission list is introduced.

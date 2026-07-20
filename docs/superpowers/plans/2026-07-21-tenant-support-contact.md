# Tenant Support Contact Implementation Plan

> For agentic workers: use TDD and execute the tasks in order. Steps use checkbox
> syntax for tracking.

Goal: Make the miniapp support contact tenant-configurable through the existing
TenantSettings flow, with a safe generic fallback when no contact is configured.

Architecture: Extend the existing shared TenantSettings contract and nullable Prisma
column. Reuse GET/PUT /api/tenant-settings, TenantSettingsService authorization,
Web BrandingContext, and miniapp branding store. Add an explicit forceRefresh option
only for the miniapp Me page so the support modal reads current backend data while
the existing workbench/trace cache-first behavior remains unchanged.

Tech Stack: pnpm 10.33.2, TypeScript, Zod, NestJS, Prisma/PostgreSQL, React/Vite,
Taro 4, Vitest.

## Global Constraints

- Do not use the using-superpowers skill.
- Do not add a customer-support module, anonymous contact endpoint, CRM, chat, lead
  form, or third-party dependency.
- supportContact is nullable and at most 128 trimmed characters; blank UI input is
  normalized to null.
- Existing SYSTEM_ADMIN authorization and tenantId scoping must remain unchanged.
- Missing or failed settings reads must never display 400-000-0000 or any fabricated
  contact; the miniapp fallback is a generic operator prompt.
- Existing public landing VITE_PUBLIC_SALES_CONTACT behavior remains independent.
- Every production-code change gets a failing regression test first.

---

### Task 1: Shared contract and database column

Files:
- Modify packages/shared/src/dto/tenant-settings.dto.ts
- Modify packages/shared/src/dto/tenant-settings.dto.spec.ts
- Modify packages/backend/prisma/schema.prisma
- Create packages/backend/prisma/migrations/20260721090000_tenant_support_contact/migration.sql

Interfaces:
- TenantSettingsView.supportContact: string | null
- UpdateTenantSettingsInput.supportContact?: string | null
- DEFAULT_TENANT_SETTINGS.supportContact: null
- Prisma TenantSettings.supportContact: String? mapped to support_contact

- [ ] Step 1: Add failing Shared assertions.

Extend the existing tenant settings contract test with:

~~~typescript
it('defaults support contact to null and trims bounded values', () => {
  expect(DEFAULT_TENANT_SETTINGS.supportContact).toBeNull();
  expect(tenantSettingsViewSchema.parse({
    ...DEFAULT_TENANT_SETTINGS,
    supportContact: '  sales@example.com / 400-123  ',
  }).supportContact).toBe('sales@example.com / 400-123');
  expect(updateTenantSettingsSchema.parse({ supportContact: null })).toEqual({
    supportContact: null,
  });
  expect(() => updateTenantSettingsSchema.parse({
    supportContact: 'x'.repeat(129),
  })).toThrow();
});
~~~

- [ ] Step 2: Run the focused Shared test and confirm RED.

Run:

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test -- tenant-settings.dto.spec.ts
~~~

Expected: FAIL because supportContact is not part of the current schema.

- [ ] Step 3: Implement the shared contract.

Add a nullable support-contact schema with trim and max 128 characters. Include the
field in DEFAULT_TENANT_SETTINGS, tenantSettingsViewSchema, and the inferred update
type. Keep strict object parsing so unknown fields remain rejected.

- [ ] Step 4: Add the Prisma model field and forward-only migration.

Add supportContact String? @map("support_contact") to TenantSettings. Create SQL that
adds nullable support_contact to tenant_settings without inserting rows or changing
existing values. Do not add a reverse migration or destructive operation.

- [ ] Step 5: Run Shared and Prisma validation.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test -- tenant-settings.dto.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend prisma:generate
corepack pnpm@10.33.2 exec prisma validate --schema packages/backend/prisma/schema.prisma
~~~

Expected: all commands exit 0.

### Task 2: Backend settings mapping and persistence

Files:
- Modify packages/backend/src/modules/tenant-settings/tenant-settings.model.ts
- Modify packages/backend/src/modules/tenant-settings/tenant-settings.model.spec.ts
- Modify packages/backend/src/modules/tenant-settings/tenant-settings.service.spec.ts

Interfaces:
- TenantSettingsRow.supportContact: string | null
- toTenantSettingsView returns supportContact for persisted and default rows.
- Existing PUT endpoint accepts the field through the updated shared schema.

- [ ] Step 1: Add failing model/service assertions.

Add supportContact to the persisted-row fixture and assert it is preserved. Add a
service update fixture containing supportContact and assert the upsert create/update
payload remains tenant-scoped and includes only supplied fields.

~~~typescript
it('preserves support contact in the tenant view', () => {
  expect(toTenantSettingsView({
    publicCoordinateMode: 'hidden',
    brandName: 'North',
    industryName: 'Agriculture',
    defaultCropName: 'Crop',
    workbenchTitle: 'Workbench',
    defaultBaseLabel: 'Base',
    supportContact: 'support@example.com',
  }, 'ignored').supportContact).toBe('support@example.com');
});

it('allows a system admin to clear the support contact', async () => {
  const h = make();
  h.prisma.tenantSettings.upsert.mockResolvedValue({
    publicCoordinateMode: 'hidden',
    brandName: 'North',
    industryName: 'Agriculture',
    defaultCropName: 'Crop',
    workbenchTitle: 'Workbench',
    defaultBaseLabel: 'Base',
    supportContact: null,
  });
  await h.service.update(systemAdmin, { supportContact: null });
  expect(h.prisma.tenantSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: 't1' },
    create: { tenantId: 't1', supportContact: null },
    update: { supportContact: null },
  }));
});
~~~

- [ ] Step 2: Run model and service tests and confirm RED.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant-settings/tenant-settings.model.spec.ts src/modules/tenant-settings/tenant-settings.service.spec.ts
~~~

Expected: FAIL because the row mapper and test fixtures do not expose supportContact.

- [ ] Step 3: Implement the minimal row mapping.

Add supportContact to TenantSettingsRow and include row.supportContact ?? null in
the returned TenantSettingsView. The existing upsert helper already spreads the
validated DTO, so do not add a second persistence path.

- [ ] Step 4: Run backend focused tests and the backend build.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/tenant-settings/tenant-settings.model.spec.ts src/modules/tenant-settings/tenant-settings.service.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/backend build
~~~

Expected: all focused tests pass and Nest/Prisma build exits 0.

### Task 3: Web tenant settings form

Files:
- Modify packages/web/src/components/Settings.tsx
- Modify packages/web/src/components/Settings.spec.tsx

Interfaces:
- Settings draft includes supportContact.
- System-admin save sends supportContact through BrandingContext.save.

- [ ] Step 1: Add a failing Web form assertion.

Add supportContact to the mocked branding value and assert the labeled input exists,
is initialized, and is included in the save payload:

~~~tsx
it('edits and saves the tenant support contact', async () => {
  renderSettings();
  fireEvent.change(screen.getByLabelText('客服联系方式'), {
    target: { value: ' support@example.com ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存租户配置' }));
  await waitFor(() => expect(saveTenantSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ supportContact: ' support@example.com ' }),
  ));
});
~~~

- [ ] Step 2: Run the focused Web test and confirm RED.

~~~powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Settings.spec.tsx
~~~

Expected: FAIL because the input and draft property do not exist.

- [ ] Step 3: Implement the form field.

Include supportContact in draft initialization and the branding dependency list.
Add one system-admin input labeled 客服联系方式 with helper text that accepts phone,
email, or a support entry. Keep the existing save button and error handling.

- [ ] Step 4: Run the focused Web test and typecheck.

~~~powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/Settings.spec.tsx
corepack pnpm@10.33.2 --filter web lint
~~~

Expected: all Settings tests pass and tsc exits 0.

### Task 4: Miniapp fresh support display

Files:
- Modify packages/miniapp/src/store/branding.ts
- Modify packages/miniapp/src/store/branding.spec.ts
- Modify packages/miniapp/src/pages/me/index.tsx
- Modify packages/miniapp/src/pages/me/decomposition.spec.ts

Interfaces:
- loadTenantBranding(options?: { forceRefresh?: boolean }): Promise<TenantSettingsView>
- The Me page loads forceRefresh true and uses getTenantBranding().supportContact.

- [ ] Step 1: Add failing store and Me boundary assertions.

Add a store test that loads a cached value, then calls loadTenantBranding with
forceRefresh true and expects a second API call with the new supportContact. Add
source assertions that the Me page imports/uses branding, requests forceRefresh,
and no longer contains 400-000-0000.

~~~typescript
it('force refreshes cached tenant branding', async () => {
  fetchTenantSettingsMock.mockResolvedValueOnce({
    ...DEFAULT_TENANT_SETTINGS,
    supportContact: 'old@example.com',
  });
  await loadTenantBranding();
  fetchTenantSettingsMock.mockResolvedValueOnce({
    ...DEFAULT_TENANT_SETTINGS,
    supportContact: 'new@example.com',
  });
  await loadTenantBranding({ forceRefresh: true });
  expect(fetchTenantSettingsMock).toHaveBeenCalledTimes(2);
  expect(getTenantBranding().supportContact).toBe('new@example.com');
});
~~~

- [ ] Step 2: Run focused miniapp tests and confirm RED.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/store/branding.spec.ts src/pages/me/decomposition.spec.ts
~~~

Expected: FAIL because loadTenantBranding has no options and Me has no branding
contact state.

- [ ] Step 3: Implement force refresh and help-modal wiring.

Skip the cache read when forceRefresh is true; fetch the current tenant settings.
On fetch failure, retain the existing safe default behavior. In Me, initialize a
supportContact state from getTenantBranding, refresh it in useDidShow, and render
the configured value in the modal only when non-empty; otherwise render the generic
operator prompt. Remove the hardcoded phone literal.

- [ ] Step 4: Run focused miniapp tests and build.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/miniapp exec vitest run src/store/branding.spec.ts src/pages/me/decomposition.spec.ts
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
~~~

Expected: focused and full miniapp tests pass, and the Taro build exits 0.

### Task 5: Full verification, review, and commit

Files:
- Verify all files from Tasks 1-4.
- Update docs/superpowers/plans/2026-07-21-tenant-support-contact.md checkboxes.

- [ ] Step 1: Run affected package gates.

~~~powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
~~~

Expected: all available package gates pass. Database-dependent E2E remains an
environmental gate if DATABASE_URL is unavailable and must be reported as blocked.

- [ ] Step 2: Scan for the removed hardcoded contact and check whitespace.

~~~powershell
rg -n "400-000-0000|supportContact|客服联系方式" packages/miniapp/src packages/web/src packages/shared/src packages/backend/src
git diff --check
~~~

Expected: no hardcoded 400-000-0000 remains; supportContact appears only in the
intended settings path and diff check is clean.

- [ ] Step 3: Request an independent read-only review.

Review the complete implementation against the design spec. Critical and Important
findings must be fixed before commit; a missing DATABASE_URL is an environment
limitation, not a reason to fabricate E2E evidence.

- [ ] Step 4: Commit the implementation.

~~~powershell
git add packages/shared packages/backend packages/web packages/miniapp docs/superpowers/plans/2026-07-21-tenant-support-contact.md
git commit -m "feat(settings): configure tenant support contact"
~~~

## Self-Review

- The plan changes one existing settings contract and does not create a parallel
  support subsystem.
- All consumers use the same nullable field and default.
- Tenant authorization and cache boundaries remain existing code paths.
- The only cache behavior change is an explicit Me-page force refresh.
- Every production change has a specified RED test and a package-level verification.

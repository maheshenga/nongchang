# Tenant Support Contact Design

Date: 2026-07-21

## Goal

Replace the miniapp's hardcoded support phone number with a tenant-scoped support
contact configured through the existing system-admin tenant settings flow.

## Current Gap

The miniapp Me page displays a fixed 400-000-0000 value in its help modal.
The existing TenantSettings contract already powers Web and miniapp branding,
but it has no support-contact field. The miniapp branding cache can also return an
old value indefinitely, so a changed contact would not reliably reach the user.

## Chosen Approach

Add an optional supportContact field to the existing TenantSettings model and
view/update DTOs:

- Type: string | null
- Validation: trim input and allow at most 128 characters; blank UI input is sent as
  null
- Default: null
- Storage: nullable tenant_settings.support_contact
- Authorization: reuse the existing SYSTEM_ADMIN guard on PUT /api/tenant-settings
- Tenant isolation: reuse the current user.tenantId lookup and upsert boundary

The existing Web branding context and settings page will carry this field. The
system-admin settings form will expose one labeled support-contact input and explain
that it may contain a phone number, email, or support entry text. No secret values,
anonymous lead form, or new endpoint will be introduced.

The miniapp branding store will accept an optional forceRefresh option. The Me
page will call loadTenantBranding({ forceRefresh: true }) when it becomes visible,
so support changes are fetched from the backend instead of being hidden by an
indefinite local cache. Existing workbench and trace pages keep their current
cache-first behavior. If the request fails, the page uses the safe generic message
and never falls back to a fabricated phone number.

## Data Flow

System Admin Settings
  -> PUT /api/tenant-settings
  -> TenantSettingsService.upsert (tenant-scoped)
  -> tenant_settings.support_contact
  -> GET /api/tenant-settings
  -> miniapp branding store (force refresh on Me)
  -> help modal shows configured contact or generic operator prompt

## Compatibility

- Existing rows remain valid because the migration adds a nullable column.
- Existing tenants with no value receive supportContact: null.
- Existing Web public landing contact configuration via
  VITE_PUBLIC_SALES_CONTACT remains independent and unchanged.
- Existing authentication, role checks, public trace behavior, cache invalidation,
  and billing flows are untouched.

## Testing

The implementation must add or update tests for:

1. Shared DTO defaults, trimming, maximum length, null handling, and strict keys.
2. Backend view mapping and upsert arguments for the new nullable field.
3. Web settings initialization, editing, and save payload.
4. Miniapp branding force-refresh behavior.
5. Miniapp Me source/component behavior: configured contact is rendered, the
   hardcoded phone is absent, and the generic fallback remains available.

Verification must include focused tests, the affected package suites, Web typecheck,
miniapp build, and git diff --check.

## Non-Goals

- No customer-support ticketing, chat, CRM, or lead-capture workflow.
- No public anonymous API for reading tenant contacts.
- No changes to backend roles or tenant membership.
- No rewrite of the existing branding cache architecture beyond the explicit
  force-refresh option needed for fresh support settings.

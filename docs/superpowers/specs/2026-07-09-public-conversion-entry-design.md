# Public Conversion Entry Design

Date: 2026-07-09
Status: approved direction A

## Goal

Improve the unauthenticated SaaS landing page conversion path without pretending the product has self-serve signup or automatic trial provisioning.

## Approved Approach

Use a truthful assisted-opening path:

- Keep `进入控制台` as the login route for users who already have tenant credentials.
- Keep `查看开通方式` as the secondary CTA.
- Add a visible `申请开通` anchor that jumps to a real opening section.
- Explain the opening materials needed before a platform operator creates the tenant.
- Show contact information from a Vite public environment variable when configured.
- Fall back to a clear "contact platform operator" message when no contact is configured.

## Scope

In scope:

- `packages/web/src/components/PublicLanding.tsx`
- `packages/web/src/components/PublicLanding.spec.tsx`
- `.env.example`
- This spec and the matching implementation plan.

Out of scope:

- New backend lead API.
- Online registration, automatic tenant creation, payment checkout before account setup, CRM integration, analytics tracking, fake pricing, fake trial, or fake customer cases.

## UX Requirements

- The hero must distinguish existing-account login from assisted account opening.
- The opening section must state that tenants are created after operator review/configuration.
- The materials list must include organization code, administrator contact, role scope, and billing/integration needs.
- Contact text must render the configured value from `import.meta.env.VITE_PUBLIC_SALES_CONTACT`.
- The page must remain usable without that env var.

## Truthfulness Requirements

- Do not say "免费试用", "自动开通", "在线注册", or "永久免费".
- Do not imply payment, AI, map, OSS, or integrations are active before tenant configuration.
- Do not collect user data in a client-only form that goes nowhere.

## Testing Requirements

- Add tests proving the opening section exists.
- Add tests proving configured contact text renders.
- Add tests proving the fallback appears when no contact is configured.
- Keep existing login CTA behavior.
- Keep existing truthfulness negative-copy checks.

## Self-Review

- Placeholder scan: no placeholders remain.
- Consistency check: this is a UI-only conversion improvement and does not require backend changes.
- Scope check: this is one focused P1 slice.
- Ambiguity check: contact configuration uses exactly `VITE_PUBLIC_SALES_CONTACT`.

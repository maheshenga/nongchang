# Miniapp Legal And Account Lifecycle Design

## Objective

Make the WeChat miniapp launch-ready for privacy disclosure, agreement acceptance, personal-data access, portable data export, and secure account closure without deleting production traceability or financial records.

This is the third P0 item from the production UI/UX audit. It spans shared contracts, the NestJS backend, the Web system-administration surface, and the Taro miniapp. It does not redesign Web login consent, add a cooling-off period, or physically delete historical business data.

## Confirmed Product Decisions

- Legal operator information and agreement content are configured in the Web administration backend, not hard-coded into the miniapp.
- Legal configuration is tenant-scoped because each miniapp WeChat AppID and institution code resolve to a tenant.
- The miniapp reads live backend data for the "My Data" experience. No duplicate synchronized personal-data store is created.
- The same live authorization boundary produces an optional portable JSON export.
- Account closure is immediate after strong reauthentication.
- Password accounts reauthenticate with the current password.
- WeChat accounts reauthenticate with a fresh WeChat login code whose OpenID must match the current account.
- Closure anonymizes the account and revokes sessions while preserving production, traceability, audit, and financial records.
- Miniapp login and registration record the exact published legal version accepted by the user.

## Current Problems

### Legal content

The login page currently exposes one checkbox labelled `我已阅读并同意隐私与授权说明`, but:

- there is no privacy-policy page;
- there is no user-agreement page;
- the text is not a link;
- there is no configured operator identity, contact, version, or effective date;
- the backend does not record which agreement version was accepted;
- changing the institution code does not bind consent to a different tenant;
- WeChat registration collects a name and optional phone without its own legal-consent gate.

### Personal data

The miniapp "Me" page loads live profile and farm statistics, but it does not provide:

- a personal-data inventory;
- a portable data copy;
- clear inclusion and exclusion rules;
- account-closure controls.

### Physical deletion is unsafe

`User` is referenced by owned fields, batches, farm-record operators, supplies, supply issues, and upload assets. Prisma relations intentionally use restrictive deletion semantics. Hard deletion would either fail or require destroying production and audit history.

The selected closure model therefore retains the user row as a pseudonymous historical anchor.

## Considered Architectures

### A. Dedicated legal and account-lifecycle modules

Create a tenant-scoped legal publication module, immutable consent records, a focused account-data service, and account-closure methods under the authenticated account boundary.

This is the selected approach. It keeps legal publication, consent evidence, personal-data queries, and authentication responsibilities explicit and independently testable.

### B. Store legal content in integration configuration

The existing integration module already stores WeChat, speech, and map settings. Adding legal documents there would reduce file count, but it would mix public policy content with third-party credentials and make permissions and lifecycle rules difficult to understand.

### C. Build an asynchronous compliance center

An export-job queue, email delivery, approval workflow, and cooling-off scheduler would support large-scale compliance operations. It is not required for the current P0 and would introduce infrastructure that the repository does not otherwise need.

## Legal Configuration Architecture

### Draft and immutable publication

Use two tenant-scoped records:

1. `LegalSettings` stores the editable draft payload for one tenant.
2. `LegalPublication` stores an immutable snapshot created by each publish action.

The draft payload contains:

```ts
interface LegalDocumentPayload {
  operatorName: string;
  contactAddress: string;
  privacyContact: string;
  contactPhone: string | null;
  contactEmail: string | null;
  privacyVersion: string;
  agreementVersion: string;
  effectiveDate: string;
  privacyPolicyText: string;
  userAgreementText: string;
}
```

At least one of `contactPhone` or `contactEmail` is required. Both documents are plain text. The Web UI does not accept or render arbitrary HTML.

Validation is explicit: operator name `2..128` characters, contact address `2..256`, privacy contact `2..64`, each version `1..32`, and each document body `200..50_000`. The effective date must be today or earlier because scheduled future publication is out of scope.

Publishing validates the complete draft and creates a new immutable `LegalPublication`. Publications are never updated or deleted through the application API. Editing a later draft never changes the currently published snapshot.

The public miniapp endpoint returns only the latest published snapshot. It never exposes draft content.

### Administration endpoints

Add a dedicated backend module with system-administrator authorization:

- `GET /legal-settings` returns the tenant draft and current publication metadata;
- `PUT /legal-settings` saves a complete draft;
- `POST /legal-settings/publish` validates and publishes an immutable snapshot.

Only `system_admin` can manage the legal configuration for its tenant. Platform-wide legal template management and agent-managed overrides remain out of scope.

### Public resolution

Add:

```http
GET /public/legal?tenantCode=DEMO
GET /public/legal?appId=wx...
```

Resolution rules:

- `tenantCode` resolves the institution selected for password login;
- `appId` resolves the tenant through its enabled WeChat integration;
- if both values are present, they must resolve to the same tenant;
- an unknown or mismatched tenant returns a safe not-found response;
- a tenant without a publication returns `configured: false` and no draft fields;
- a configured response includes the immutable publication ID, operator/contact fields, versions, effective date, and both plain-text documents.

This endpoint is public, read-only, throttled, and contains no credentials.

## Legal Consent Evidence

### Consent record

Add an immutable `LegalConsent` record containing:

- tenant ID;
- user ID;
- legal publication ID;
- privacy-policy version;
- user-agreement version;
- accepted timestamp;
- client value `miniapp`.

Use a unique constraint on `(userId, publicationId, client)` so repeated login against the same publication is idempotent.

### Dedicated miniapp authentication routes

Keep existing Web and generic authentication routes unchanged. Add miniapp-specific routes that require a legal publication ID:

- `POST /auth/miniapp/login`;
- `POST /auth/miniapp/wechat`;
- `POST /auth/miniapp/wechat/register`.

Before issuing tokens or completing registration, the backend verifies that:

- the publication exists;
- it belongs to the resolved tenant;
- it is the tenant's current published version;
- the miniapp submitted the accepted publication ID.

Successful login records consent idempotently before tokens are returned. Successful WeChat registration creates the pending user and consent record in the same transaction.

If a newer legal publication exists, login or registration using the old publication returns a conflict response that tells the miniapp to reload and request consent again.

### Miniapp consent state

The login and registration screens store consent against a stable key composed from the resolved tenant and publication ID.

- changing the institution code clears the checked state;
- loading a different publication clears the checked state;
- failed or missing legal configuration disables consent and submission;
- the miniapp never treats cached consent for one tenant or version as consent for another;
- password login, WeChat login, and WeChat registration all fail closed when publication validation is unavailable.

## Miniapp Legal Experience

### Login and registration

Replace the existing generic notice with:

`我已阅读并同意《用户协议》和《隐私政策》`

Both document names are independent navigation controls. The current versions and effective date appear near the consent row.

The registration page has its own consent state and the same legal links. Navigating from login does not silently carry a checked value into registration.

### Legal page

Add one reusable page route that renders either `privacy` or `agreement` from the published payload. It displays:

- document title;
- operator name;
- version;
- effective date;
- plain-text content;
- privacy contact and contact method.

The page is available before login. Loading, unconfigured, mismatch, and retry states are explicit.

### Me page

Add a `法律与账户` section containing:

- `我的数据`;
- `隐私政策`;
- `用户协议`;
- `注销账号`.

Administrative roles see the data and legal links but do not see a self-service closure command. The backend still rejects an attempted administrative closure.

## Live Personal-Data View

### Authorization boundary

Add an `AccountDataService` used only with the authenticated `AuthUser`. Every query includes both `tenantId` and the current `userId` or an ownership relation derived from that user.

The service never accepts a user ID from miniapp input.

### Preview endpoint

Add:

```http
GET /auth/me/data
```

It returns a live summary and recent records for:

- safe profile fields;
- fields owned by the current user;
- batches owned by the current user;
- farm records whose `operatorId` is the current user;
- supplies and supply issues owned by the current user;
- upload metadata whose `userId` is the current user;
- AI-operation metadata whose `userId` is the current user;
- credit orders whose `buyerId` is the current user;
- the user's merchant credit-account and ledger summary when one exists.

The preview contains counts and the latest 20 items per category rather than loading every historical row into the page.

It excludes:

- `passwordHash`;
- WeChat OpenID;
- session versions and token data;
- integration, AI-provider, OSS, and payment secrets;
- other users' names, phone numbers, records, or uploads;
- raw internal OSS object keys;
- other tenants' data.

### Portable export

Add:

```http
GET /auth/me/data/export
```

The endpoint executes the same live authorization rules and returns a UTF-8 JSON attachment with:

- `schemaVersion: 1`;
- generation timestamp;
- tenant and account identifiers;
- the allowed complete collections;
- an exclusions statement.

The server does not persist a second export copy. It generates the response from current backend data on demand.

The export is rejected with an explicit `413` response if any category exceeds 10,000 records or the serialized JSON exceeds 10 MiB. It never silently truncates. The error directs the user to the configured privacy contact for an assisted export.

The miniapp downloads the authenticated file, saves it in the WeChat user-data area, and offers the platform file-sharing action. Preview failure and export failure are independent so users can still view data when file generation is unavailable.

## Secure Account Closure

### Eligibility

Self-service closure is allowed only for `merchant` and `member` roles.

The backend rejects `platform_admin`, `system_admin`, and `agent_admin` closure because those accounts may own platform or tenant administration responsibilities that require an explicit transfer workflow.

### Verification method

Extend the safe profile view with a non-sensitive field:

```ts
deletionVerification: 'password' | 'wechat';
```

Accounts with a bound WeChat OpenID use WeChat verification. Other eligible accounts use password verification. The raw OpenID is never returned.

The closure request is a discriminated union:

```ts
type CloseAccountInput =
  | { method: 'password'; currentPassword: string; confirmation: '注销账号' }
  | { method: 'wechat'; appId: string; code: string; confirmation: '注销账号' };
```

Password verification uses the current password hash. WeChat verification exchanges a fresh code, verifies that the AppID belongs to the current tenant, and compares the returned OpenID with the current account.

### Anonymization transaction

After successful verification, the backend updates the existing user row atomically:

- `status = 'deleted'`;
- `username = 'deleted_' + userId`;
- `displayName = '已注销用户'`;
- `phone = null`;
- `wxOpenid = null`;
- `groupId = null`;
- password hash is replaced with a new random, unusable password;
- `sessionVersion` increments.

The stable user ID, tenant ID, role, and historical business ownership relations remain so database foreign keys and audit chains stay valid.

After the transaction, the session-validation cache is invalidated. Existing access and refresh tokens stop working, and the miniapp clears both local tokens before redirecting to login.

The operation is irreversible. The same WeChat identity may apply for a new account later because the old OpenID has been removed, but the closed account is not restored.

### Closure page

The miniapp uses a dedicated danger page rather than an inline menu action. It explains:

- personal fields that will be removed;
- production and financial records that will be retained;
- the recommendation to export data first;
- that closure cannot be undone.

No closure request is sent before the user completes the role-appropriate reauthentication and the final danger confirmation.

## Error Handling

- Public legal loading failure keeps login and registration disabled and provides retry.
- Unpublished legal configuration displays `协议尚未配置，请联系管理员` without inventing an operator.
- Publication mismatch clears consent and reloads the current publication.
- Personal-data preview failure preserves the page shell and provides retry.
- Export-limit failure reports the exact non-truncation rule and configured contact.
- Password reauthentication failure does not change account state.
- WeChat cancellation, AppID mismatch, code-exchange failure, and OpenID mismatch do not change account state.
- Anonymization failure leaves tokens and user data unchanged and reports a retryable error.
- After successful closure, later requests are expected to return unauthorized because the session is revoked.

## Testing Strategy

### Shared contracts

Test:

- legal draft/publication payload validation;
- public configured and unconfigured response schemas;
- miniapp login/register consent DTOs;
- account-data preview schema;
- closure input discriminated union;
- sensitive fields absent from exported view types.

### Backend

Test:

- system-admin-only draft and publish endpoints;
- immutable publication snapshots;
- tenantCode and AppID resolution with mismatch rejection;
- public endpoints never expose drafts;
- miniapp authentication rejects missing, stale, or cross-tenant publication IDs;
- consent creation is idempotent and registration is transactional;
- every personal-data category is tenant and user scoped;
- export excludes secrets and fails rather than truncating;
- password and WeChat reauthentication;
- administrator-role rejection;
- anonymization fields, retained foreign-key rows, session-version increment, and cache invalidation.

### Web administration

Test:

- draft loading and saving;
- publish validation and confirmation;
- current published version remains visible while a later draft is edited;
- plain text is rendered as text rather than injected HTML;
- loading, error, unconfigured, draft, and published states.

### Miniapp

Test:

- institution change resets consent;
- login and registration are disabled without a current publication;
- both legal links open the correct document;
- accepted publication ID is sent to miniapp authentication routes;
- "My Data" renders live summary/error/retry states;
- export uses authenticated download and file sharing;
- closure UI selects password or WeChat reauthentication correctly;
- no closure request occurs before final confirmation;
- successful closure clears tokens and redirects to login.

### Verification gates

Run focused RED/GREEN tests during each task, then:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/shared test
corepack pnpm@10.33.2 --filter @nongchang/backend test
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/miniapp test
corepack pnpm@10.33.2 --filter @nongchang/miniapp test:e2e
corepack pnpm@10.33.2 --filter @nongchang/miniapp build:weapp
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
```

Database-backed backend E2E verification uses the existing PostGIS demo environment when required.

## Out Of Scope

- physical deletion of production, traceability, audit, payment, or ledger rows;
- a seven-day cooling-off or restoration flow;
- asynchronous export jobs, email delivery, or approval queues;
- binary export of uploaded files;
- Web login or Web registration legal-consent redesign;
- platform-admin global template management;
- agent-specific legal overrides;
- administrator self-service closure;
- legal advice or a claim that the supplied text automatically satisfies every jurisdiction.

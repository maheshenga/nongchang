# Nongchang UI/UX Stage 5-8 Follow-up Hardening Design

## Context

Stages 1-4 closed the previously approved P0-P2 UI/UX plan, but rendered QA and a follow-up code audit found seven remaining correctness and continuity gaps across the Taro miniapp, NestJS authentication flow, and React web console. The user approved all seven recommendations for implementation on 2026-07-13.

This design covers those recommendations as one release train with four independently testable stages. Each stage must preserve the current tenant, role, credit, public-trace, and unsaved-change boundaries. The implementation will remain in the isolated `codex/full-hardening-roadmap` worktree and must not modify the unrelated main-checkout change in `packages/web/src/api/trace.spec.ts`.

## Approved Scope

1. Prevent stale or out-of-order miniapp trace data from crossing batch boundaries.
2. Preserve batch context when the batch page opens the farm-record entry flow.
3. Remove the fabricated support telephone number and use truthful configuration-backed guidance.
4. Return and display a real WeChat registration application identifier and status.
5. Add retryable miniapp error states and paginated, filterable usage history.
6. Add authenticated Web hash routing, correct the desktop menu control, and provide an application error boundary.
7. Improve accessibility, search keyboard behavior, long-list performance, navigation preference isolation, and miniapp rendered/E2E coverage.

## Goals

- Make selected-batch views render only data that belongs to the current batch.
- Carry a one-time, explicit batch intent into the farm-record form.
- Ensure every support, registration, loading, error, and status message is backed by real configuration or stored data.
- Give miniapp users independent recovery paths when one data source fails.
- Make authenticated Web locations reloadable, shareable, and compatible with browser back/forward navigation.
- Ensure shell-level failures recover without trapping the user on a blank page.
- Make the main navigation and search paths operable with keyboard, touch, and assistive technology.
- Bound server queries and rendered list size while preserving access to complete datasets.
- Add automated coverage for the highest-risk miniapp rendered workflows.

## Non-goals

- Replacing React, Taro, NestJS, Prisma, Vitest, or the current Fluent-derived visual system.
- Introducing a separate registration-application database model when the existing pending user is already the source of truth.
- Exposing registration status by an arbitrary public application ID.
- Building offline mutation synchronization for the miniapp.
- Replacing hash routing with a new routing dependency.
- Implementing a second desktop-sidebar collapse model; the existing mobile drawer remains the only overlay navigation.
- Virtualizing every short list. Rendering optimization applies only to lists that can exceed the selected page size or append multiple pages.

## Approaches Considered

### Patch each page locally

This has the smallest initial diff, but it would repeat request-race logic, error-state markup, navigation parsing, storage access, and keyboard behavior. The resulting pages would continue to diverge and would be difficult to test consistently.

### Incremental shared state and navigation foundations

This is the selected approach. Small pure helpers define trace request ownership, one-time miniapp navigation intent, registration contracts, Web route mapping, safe storage, and async-state behavior. Pages consume those helpers without a broad framework rewrite. Each helper is independently testable before the UI migration that uses it.

### Full routing and state-management replacement

Adding React Router and a new cross-platform state library could unify more behavior, but it would expand bundle size and migration risk beyond the approved gaps. Existing hash handling, Taro storage, component state, and server APIs are sufficient when their contracts are made explicit.

## Architecture

### Stage 5: Miniapp correctness and truthful support

#### Trace request ownership

The trace page will maintain a monotonically increasing request epoch. Selecting a batch performs these state transitions synchronously before the request starts:

1. increment the epoch;
2. set the selected batch ID;
3. clear the current events;
4. set the selected batch to `loading`.

Only the response whose epoch and batch ID still match the current selection may set `success` or `error`. An older success or failure is ignored. The trace chain summary and timeline render only when the current selected batch has a successful matching result. Loading and error states never reuse the previous batch's event count. Hard-coded crop wording is replaced by the selected batch's crop name or neutral trace wording.

The ownership comparison will live in a small pure model rather than being embedded only in the component, so out-of-order completion can be covered without depending on Taro rendering timing.

#### One-time farm-record intent

The batch page writes a versioned `PendingRecordIntent` before switching to the Work tab:

```ts
interface PendingRecordIntent {
  version: 1;
  batchId: string;
  batchNo: string;
  cropName: string;
  createdAt: number;
}
```

The intent is stored through a focused Taro-storage helper under a versioned key. The Work page consumes and removes it once when the page becomes visible. A valid intent opens the record form and preselects the matching batch. An expired intent, malformed data, or a batch that is no longer visible to the current user is discarded and the existing manual selection flow remains available. The expiry window is 10 minutes to prevent an old action from surprising the user on a later visit.

Consumption is idempotent: revisiting the Work tab or remounting the form cannot reopen the same intent.

#### Truthful support contact

The miniapp reads optional build-time configuration `TARO_APP_SUPPORT_CONTACT`. When non-empty, support guidance displays that exact configured value. When absent, the UI displays only `请联系平台管理员` and never invents a phone number, account, service time, or response promise.

The Me page's trace entry becomes an active action that switches to the trace tab. Account identity uses a neutral loading label until profile data succeeds; it does not default to a role or name that has not been loaded.

### Stage 6: Miniapp workflow closure and recovery

#### Real registration identifier and status

The existing pending `User` row remains the registration application's source of truth. `POST /auth/wechat/register` will return:

```ts
interface WechatRegisterResponse {
  applicationId: string;
  status: 'pending';
}
```

`applicationId` is the created user record ID returned by Prisma. It is an identifier, not an authentication credential, and the miniapp may display and locally retain it for user reference.

Status lookup will use `POST /auth/wechat/register/status` with the same `{ appId, code }` shape as WeChat login. The backend resolves the enabled tenant integration, exchanges a fresh WeChat temporary code for `openid`, and queries `(tenantId, wxOpenid)`. It never accepts an arbitrary application ID as lookup authority. The response is:

```ts
interface WechatRegistrationStatusResponse {
  applicationId: string;
  displayName: string;
  status: 'pending' | 'approved' | 'rejected_or_suspended';
  updatedAt: string | null;
}
```

The current schema has no review timestamp, so `updatedAt` is explicitly nullable and remains `null` until a truthful timestamp source exists. Existing user status maps as follows: `pending` to `pending`, `active` to `approved`, and `suspended` to `rejected_or_suspended`. The combined final state avoids falsely claiming whether a suspended record was rejected during onboarding or disabled later.

Submitting a duplicate registration no longer leaves the user without a next step. The miniapp can call the authenticated-by-fresh-code status endpoint and show the existing application's real state. Network, missing-application, disabled-integration, and WeChat-code errors remain distinct.

#### Shared miniapp async state

A reusable miniapp data-state component will represent `loading`, `error`, `empty`, and `success` without hiding retry actions inside toasts. It accepts concise title, detail, and retry callbacks and uses Taro-native `Button` semantics.

The Work page splits its current coupled loading into independently recoverable resources:

- batches;
- farm records;
- quick templates;
- billing summary.

A failure in one resource does not erase successful sibling data. Required form dependencies disable only the controls that depend on them and explain why. Optional templates and billing display inline retry states instead of silently swallowing failures.

The Me page keeps a visible profile error with a real retry action. Login keeps a persistent inline error until the user edits or retries, trims all credential inputs, disables both login methods while either request is active, and provides truthful password-recovery guidance through the same support-contact policy. The user must affirm the privacy and authorization notice before WeChat authorization or password login proceeds.

#### Paginated usage history

The miniapp billing API accepts the existing server query fields `resource`, `reason`, `page`, and `pageSize`. The usage page starts at page 1 with a page size of 20, tracks `total`, and derives `hasMore` from the number of loaded unique items.

`onScrollToLower` requests the next page once, ignores duplicate triggers while loading, appends without duplicate IDs, and exposes an inline retry if an append request fails. Changing the resource or reason filter clears the list, resets pagination, and loads page 1. The billing summary and ledger have independent states so one can remain useful when the other fails.

### Stage 7: Web URL continuity and failure recovery

#### Authenticated hash route contract

Authenticated workspace routes are:

```text
#/app/overview
#/app/batches
#/app/records
#/app/billing
```

Every existing authenticated tab receives a stable route segment through a central route table. The four routes above are the minimum public contract and additional current tabs use the same `#/app/<segment>` convention. Existing public routes remain unchanged:

```text
#/trace/:code
#/billing/pay-result
```

On session restoration, the hash is parsed into an authenticated tab only after the user's role is known. A route unavailable to that role falls back to that role's default allowed tab and replaces the invalid hash. An unknown authenticated route also falls back safely. The URL is the source of truth for the active tab; direct reload and browser back/forward restore the matching workspace.

Internal navigation first runs the existing unsaved-change confirmation. Only confirmed navigation mutates the hash. Hash changes caused by browser back/forward also honor the guard; cancellation restores the previous valid hash without changing the mounted page.

Login establishes the role default route unless a valid, permitted authenticated route was already requested. Logout removes authenticated route state without damaging public trace or payment-result semantics.

#### Shell controls and error boundary

The drawer menu button is visible only below the medium breakpoint (`md:hidden`), matching the existing mobile-only overlay. Desktop navigation remains the persistent sidebar and no dead collapse control is displayed.

A top-level error boundary surrounds the authenticated workspace and lazy component surface. It records no secrets and displays:

- a concise failure explanation;
- `重试当前页面`, which resets the boundary and remounts the active route;
- `重新加载应用`, which performs a full reload;
- a session-expired explanation that routes to login when the failure is an authentication/session condition.

Known lazy-chunk load failures receive a one-time reload recovery marker in session storage to avoid infinite reload loops. If the same chunk fails after the one-time reload, the normal boundary remains visible with manual actions.

### Stage 8: Accessibility, search, storage, performance, and E2E

#### Mobile drawer focus management

Opening the drawer stores the trigger element, moves focus into the dialog, traps Tab and Shift+Tab within interactive controls, closes on Escape, and restores focus to the trigger. The drawer keeps accessible dialog naming and prevents background interaction while open.

#### Global search keyboard model

Global search exposes a combobox/listbox relationship with each result as an option. Arrow Down and Arrow Up move an active option without wrapping past the list ends, Enter opens the active option, Escape closes results, and Ctrl+K or Cmd+K focuses the search input. Pointer hover updates the active option without stealing input focus.

The search entry remains available on mobile through the drawer or mobile header. Empty and no-match states are announced without presenting inactive options.

#### Scoped navigation preferences

Collapsible navigation state uses:

```text
nongchang:navigation-open:v1:{tenantId}:{userId}:{role}
```

All `localStorage.getItem`, `setItem`, and removal access is wrapped in `try/catch`. Storage denial or malformed JSON falls back to default navigation state without breaking the shell. Preferences are never shared between different users or tenants on the same browser profile.

#### Bounded management lists

Management lists default to 50 rows and offer 20, 50, and 100. Search and filter terms supported by the backend are sent to the server rather than applied only to a partial client page. Changing filters resets to page 1. Page responses retain `total` and page metadata.

Lists that append or render more than one page use stable keys, memoized row/card components, and bounded retention. The UI does not keep unbounded historical pages in the DOM. Full virtualization is introduced only for a measured surface that still exceeds the performance budget after pagination and memoization.

#### Miniapp interaction semantics and E2E

Primary clickable `View` elements in login, batch, work, trace, usage, and Me flows are converted to Taro `Button` elements where practical. Custom surfaces that must remain `View` receive explicit accessible role/label semantics, disabled behavior, and visible pressed feedback. Disabled actions cannot still fire through nested handlers.

A miniapp rendered/E2E smoke harness is added as a separate script rather than folded into unit tests. It must cover:

- password and WeChat login mutual exclusion and privacy confirmation;
- batch `记一笔` intent handoff into a preselected record form;
- trace batch switching with out-of-order responses;
- usage initial load, filter reset, append pagination, and append retry;
- registration submission and status refresh;
- profile retry and trace-tab navigation.

The harness may use the repository's existing Vitest/jsdom component environment for rendered interaction tests where Taro APIs are mocked faithfully. If WeChat DevTools automation is available in CI, a thin smoke layer may be added later, but this release does not claim real-device proof without that runtime.

## Error Handling

- Stale request results are ignored and cannot replace the current selection.
- Miniapp errors remain visible until retry or a new successful request; toasts are supplementary only.
- Append failures preserve already loaded usage items and retry only the failed page.
- Registration status never discloses another user's record based only on an application ID.
- Support copy never displays a fallback phone number or account.
- Authenticated route failures resolve to the current role's allowed default.
- Unsaved-change rejection leaves both the active component and hash unchanged.
- Error-boundary recovery avoids infinite automatic reload loops.
- Storage failures degrade to in-memory defaults rather than blocking navigation.
- No credit-consuming mutation gains automatic retry behavior.

## Testing Strategy

### Shared, backend, and API contract tests

- Registration response and status schemas accept only the documented fields and states.
- Registration creation returns the created user ID.
- Status lookup uses fresh WeChat identity, remains tenant-scoped, and rejects missing or disabled integrations.
- Suspended records map to `rejected_or_suspended` rather than a more specific unsupported claim.
- Miniapp billing query serialization includes optional resource and reason filters.

### Miniapp unit and rendered tests

- Out-of-order trace responses cannot cross selected batches.
- Trace loading/error states clear the previous event chain.
- Pending record intent validates version/age, consumes once, and preselects only a visible batch.
- Support-contact copy has configured and unconfigured cases.
- Independent Work resource failures retain successful sibling data and retry only the failed source.
- Usage pagination deduplicates items, blocks concurrent append, resets on filter changes, and preserves items on append failure.
- Login trims values, mutually disables methods, preserves inline errors, and requires authorization confirmation.
- Registration displays the returned identifier and refreshes the real backend state.
- Me profile recovery and trace-tab navigation are actionable.

### Web unit and browser tests

- Hash parsing, tab serialization, role fallback, and unknown-route behavior.
- Direct authenticated route load after session restoration.
- Browser back/forward with and without unsaved changes.
- Desktop menu button hidden at 1280 and 1440 pixels; mobile drawer available at 390 and 768 pixels.
- Error boundary retry, full reload action, session-expired guidance, and one-time lazy-chunk recovery.
- Drawer Tab/Shift+Tab containment, Escape close, and trigger focus restoration.
- Global search listbox semantics, arrow navigation, Enter selection, Escape, Ctrl/Cmd+K, and mobile access.
- User/tenant/role storage isolation and storage-denied fallback.
- Page-size defaults/options, server-filter reset, and bounded rendered row counts.

### Verification gates

- Every behavior change begins with one focused failing test and follows red-green-refactor.
- Focused package tests pass after each implementation slice.
- Shared, backend, Web, miniapp, browser, and automated accessibility suites pass.
- Web and miniapp production builds pass.
- `pnpm verify:local` passes at the end of the release train.
- Rendered browser assertions cover desktop and mobile shell behavior.
- Miniapp E2E claims are limited to the runtime actually executed and reported.

## Delivery Order

### Stage 5: Miniapp correctness

- Trace request ownership and truthful selected-batch rendering.
- Versioned one-time farm-record intent.
- Configured support contact, neutral Me identity, and trace-tab action.

### Stage 6: Miniapp workflow closure

- Registration identifier and secure status lookup contracts.
- Shared async/error state and independent Work resource recovery.
- Usage filters, server pagination, append retry, and deduplication.
- Login recovery, mutual exclusion, input normalization, and authorization confirmation.

### Stage 7: Web continuity and recovery

- Central authenticated hash route table and role-aware restoration.
- Unsaved-change-safe internal and history navigation.
- Mobile-only menu trigger.
- Workspace error boundary and lazy-chunk recovery.

### Stage 8: Accessibility, performance, and E2E

- Drawer focus management and Global Search keyboard semantics.
- Tenant/user/role-scoped safe preference storage.
- Bounded page sizes, server filtering, and list rendering optimization.
- Miniapp interaction semantics and rendered/E2E smoke coverage.

## Acceptance Criteria

The work is complete only when all seven approved recommendations map to passing automated tests or explicit rendered assertions; trace and usage race cases are deterministically reproduced before their fixes; a registration can display and securely refresh its stored real status; authenticated Web routes survive reload and browser history navigation; desktop no longer exposes a dead menu control; shell failures present working recovery actions; keyboard users can operate the mobile drawer and global search; list queries and DOM retention are bounded; miniapp smoke coverage runs through a documented repository script; all production builds and the complete local verification gate pass; and unrelated user changes remain untouched.

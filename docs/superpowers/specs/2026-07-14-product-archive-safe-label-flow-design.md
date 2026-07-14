# Product Archive Safe Label Flow Design

## Objective

Eliminate accidental QR-credit spending and make the merchant product archive usable at mobile widths by replacing its independent trace-code generation implementation with the existing safe `BatchLabelWorkspace` flow.

This is the second P0 implementation item from the production UI/UX audit. It covers the Web product archive and the shared label-generation workspace. It does not change backend billing, trace-code idempotency, or batch authorization.

## Current Problems

The Web application currently has two production trace-code generation experiences:

- `BatchAdmin` opens `BatchLabelWorkspace`, shows quota math, requests confirmation, and reuses an idempotency key across ambiguous retries;
- `MerchantAdmin` defaults the quantity to `100` and calls `generateCodes` immediately when the user presses `生成溯源码`;
- `MerchantAdmin` also generates one new trace code per selected batch as a hidden side effect of opening its print preview.

The product archive layout compounds the risk on narrow screens:

- the desktop `whitespace-nowrap` table remains the primary list at mobile widths;
- a second assignment panel is stacked below the list and keeps its own scroll container;
- the page can therefore contain horizontal table scrolling plus independent list and panel scrolling;
- selection, generation intent, existing-code preview, and print intent are visually mixed.

## Considered Approaches

### A. Reuse `BatchLabelWorkspace` from the product archive

Keep the product archive as a searchable batch/product index. A single-batch `配置溯源标签` action opens the same `BatchLabelWorkspace` used by batch management. Remove the product archive's direct-generation side panel and its implicit code-generating print preview.

This is the chosen approach because it creates one safety contract for quantity validation, quota math, confirmation, idempotent generation, and print preview while preserving a useful product-oriented entry point.

### B. Remove all label actions from the product archive

The archive could become read-only and route every user to batch management. This is the smallest implementation, but it adds a second search step and loses the product-oriented entry point users already have.

### C. Harden the existing product-archive side panel independently

Adding confirmation and quota checks to the current panel would fix the immediate debit risk, but it would retain two label implementations, two print previews, and two future maintenance paths. It also leaves the mobile nested-scroll structure intact.

## Chosen Architecture

### Shared label workspace

`BatchLabelWorkspace` remains the only component that can initiate interactive Web trace-code generation.

It will:

- default the requested quantity to `1`, not `100`;
- require an integer from `1` through `10_000`;
- show current balance, requested amount, and expected remaining balance;
- disable generation while quota is loading, when quota loading failed, or when the requested amount exceeds the known balance;
- expose a quota retry action when loading failed;
- always create a named confirmation request before `onGenerate` runs;
- keep its existing print/PDF preview after successful generation.

Its quota contract becomes explicit:

```ts
interface BatchLabelWorkspaceProps {
  codeBalance: number | null;
  quotaLoading: boolean;
  quotaError: string | null;
  onRetryQuota(): void;
}
```

`codeBalance: null` is never interpreted as permission to spend. The backend remains authoritative, but the Web user cannot intentionally submit a debit until the current balance has been displayed.

### Product archive coordinator

`MerchantAdmin` will load:

- batches through `listBatches`;
- fields through `listFields`, so shared `toViewBatch` produces the same user-facing field identity used by batch management;
- billing summary through `getBillingSummary`.

It will retain only coordination responsibilities:

- filter the batch/product index;
- navigate to batch creation;
- open one selected batch in `BatchLabelWorkspace`;
- own the generation request key for that batch and count;
- reload batches and billing after confirmed success;
- show existing loading, empty, error, and toast feedback.

The following `MerchantAdmin` state and behavior will be removed:

- multi-select batch state;
- local QR preview state;
- direct `qrAmount` state;
- direct generation side panel;
- automatic code generation when opening print preview;
- the independent product-archive print dialog.

### Confirmation integration

`MerchantAdmin` will adapt `BatchLabelWorkspace.requestConfirmation` to the existing application `confirmDialog` service. It will display the exact batch code, product, field, quantity, and debit rule supplied by the workspace. `onGenerate` runs only after the user selects the danger-aware confirmation action.

The idempotency request key is retained after failure and cleared only after `generateCodes` succeeds, matching the existing batch-management retry behavior.

## Responsive UI

### Desktop, `md` and wider

Render a compact product archive table with:

- product name;
- batch number;
- lifecycle status;
- generated-code count;
- one `配置溯源标签` action;
- one `查看批次完整档案` navigation action.

The table may use one horizontal overflow boundary as a last resort, but no nested list or side-panel scrolling remains.

### Mobile, below `md`

Do not render the desktop table. Render one semantic `<article>` per batch with:

- product name and lifecycle status in the header;
- batch number and generated-code count as scan-friendly facts;
- full-width `配置溯源标签` and `查看批次完整档案` actions;
- a stable `aria-label` containing the batch number.

The list uses the page scroll only. The shared modal owns its own bounded scroll while open.

## Data And Error Flow

1. Product archive loads batches, fields, and billing independently so one failure does not erase other successful data.
2. Batch-list failure renders the existing retryable `ErrorState`.
3. Field-list failure falls back to the shared unknown-field identity and does not block archive use.
4. Billing loading or failure keeps label generation disabled inside the workspace.
5. `重试额度` calls the billing resource reload without reloading the batch list.
6. User selects a batch and opens the shared workspace.
7. User chooses a valid quantity and confirms the exact debit intent.
8. `generateCodes` receives the retained idempotency key.
9. Success reloads both batch counts and quota, clears the request key, and opens the existing print preview.
10. Failure keeps the request key for a safe retry and reports the server error without claiming a debit outcome.

## Testing

### Shared workspace component

Update `BatchLabelWorkspace.spec.tsx` to prove:

- default requested quantity is `1`;
- known quota renders correct remaining balance;
- insufficient quota disables generation;
- loading quota disables generation;
- failed quota displays `重试额度` and invokes `onRetryQuota`;
- clicking generate only creates a confirmation request and does not call `onGenerate` directly.

### Product archive component

Update `MerchantAdmin.actions.spec.tsx` to prove:

- batch creation still routes to the batch page;
- desktop and mobile product representations expose the same safe label command;
- opening the command renders `BatchLabelWorkspace` with real batch, field, and quota data;
- no `generateCodes` call happens before confirmation;
- confirmed generation uses quantity `1` by default and the product-archive idempotency source;
- a failed generation retry reuses the same key;
- no print command creates trace codes outside the shared workspace.

### Browser regression

Extend the existing responsive P0 Playwright suite at `390px` to prove:

- the product archive has no document-level horizontal overflow;
- the mobile product card and label command are visible;
- opening and closing the label workspace does not create a page-level scroll trap;
- the debit confirmation appears before any generation request is allowed.

## Verification Gates

```powershell
corepack pnpm@10.33.2 --filter web exec vitest run src/components/MerchantAdmin.actions.spec.tsx src/components/batch-admin/BatchLabelWorkspace.spec.tsx
corepack pnpm@10.33.2 --filter web lint
corepack pnpm@10.33.2 --filter web test
corepack pnpm@10.33.2 --filter web build
corepack pnpm@10.33.2 exec playwright test e2e/web/responsive-p0.spec.ts
```

## Out Of Scope

- changing the backend trace-code debit or idempotency implementation;
- adding refund, cancellation, or code revocation workflows;
- printing previously generated codes from arbitrary historical ranges;
- redesigning the complete batch-management console;
- exposing billing purchase navigation to merchant roles;
- changing miniapp QR behavior.

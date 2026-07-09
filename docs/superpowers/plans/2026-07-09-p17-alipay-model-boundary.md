# P17 Alipay Model Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic Alipay billing helpers from `AlipayService` so config masking, config write data, payment request construction, payment response shaping, and notify validation decisions are directly tested.

**Architecture:** `AlipayService` remains responsible for role checks, Prisma reads/writes, encryption/decryption, SDK construction/invocation, and billing settlement. A new `alipay.model.ts` owns pure Alipay config/payment/notify shaping with no database, SDK, or Nest side effects.

**Tech Stack:** NestJS service, Vitest, TypeScript, existing `@nongchang/shared` billing DTO and response types.

## Global Constraints

- Do not change billing controller routes, DTO schemas, API response shape, Prisma query shape, SDK class import, or settlement call.
- Preserve provider value: `alipay`.
- Preserve config view masking: configured private key/public key returns `已配置(已加密)`, missing key returns `null`.
- Preserve first-time config validation behavior in service: missing `privateKey` or `alipayPublicKey` still throws `首次配置需提供应用私钥与支付宝公钥`.
- Preserve upsert semantics: create uses `secretEnc: secretEnc ?? null`, `apiKeyEnc: apiKeyEnc ?? null`, `enabled`; update always includes `{ appId, enabled }` and only includes encrypted key fields when new key values are provided.
- Preserve SDK gateway fallback: `process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'`.
- Preserve payment method/product codes: PC uses `alipay.trade.page.pay` and `FAST_INSTANT_TRADE_PAY`; WAP uses `alipay.trade.wap.pay` and `QUICK_WAP_WAY`.
- Preserve payment URLs: notify URL is `<PUBLIC_BASE_URL without trailing slash>/api/billing/alipay/notify`; return URL is `<WEB_BASE_URL without trailing slash>/#/billing/pay-result?orderId=<order.id>`.
- Preserve payment subject: `额度购买-AI算力-<quantity>` when `resource === 'AI'`, otherwise `额度购买-二维码-<quantity>`.
- Preserve payment amount formatting: `amountCents / 100` with `toFixed(2)`.
- Preserve timeout express: `30m`.
- Preserve `PaymentView`: PC returns `payUrl` and `formHtml: null`; WAP returns `formHtml` and `payUrl: null`.
- Preserve notify success statuses: only `TRADE_SUCCESS` and `TRADE_FINISHED` settle; other verified trade statuses return `success` without settlement.
- Preserve notify amount validation: `Number(total_amount)` must be finite and `Math.round(paidYuan * 100) === order.amountCents`.
- Preserve notify fallback channel: `order.payChannel ?? 'alipay'`.

---

## File Structure

- Create `packages/backend/src/modules/billing/alipay.model.ts`
  - Pure helpers for provider constant, config view, upsert args, SDK config data, payment request params, payment view, notify status/amount decisions.
- Create `packages/backend/src/modules/billing/alipay.model.spec.ts`
  - Direct helper tests for payment/config/notify decisions.
- Modify `packages/backend/src/modules/billing/alipay.service.ts`
  - Replace inline pure logic with imports from `alipay.model.ts`.

---

### Task 1: Add Alipay Model Tests

**Files:**
- Create: `packages/backend/src/modules/billing/alipay.model.spec.ts`

**Interfaces:**
- Future exports:
  - `ALIPAY_PROVIDER`
  - `ALIPAY_CONFIGURED_MASK`
  - `DEFAULT_ALIPAY_GATEWAY`
  - `AlipayRow`
  - `AlipayOrderForPayment`
  - `buildAlipayConfigView(row: AlipayRow): AlipayConfigView`
  - `buildAlipayConfigUpsertArgs(input: { tenantId: string; appId: string; enabled: boolean; secretEnc?: string; apiKeyEnc?: string })`
  - `buildAlipaySdkOptions(input: { row: AlipayRow; privateKey: string; alipayPublicKey: string; gateway?: string })`
  - `buildAlipayPaymentRequest(input: { order: AlipayOrderForPayment; channel: 'PC' | 'WAP'; publicBaseUrl: string; webBaseUrl: string })`
  - `buildAlipayPaymentView(input: { orderId: string; channel: 'PC' | 'WAP'; result: string }): PaymentView`
  - `isSuccessfulAlipayTradeStatus(status: string | undefined): boolean`
  - `isAlipayPaidAmountValid(totalAmount: string | undefined, amountCents: number): boolean`
  - `resolveAlipaySettlementChannel(payChannel: string | null | undefined): string`
  - `trimTrailingSlash(value: string): string`

- [ ] **Step 1: Write failing tests**

Use this test file:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ALIPAY_CONFIGURED_MASK,
  ALIPAY_PROVIDER,
  DEFAULT_ALIPAY_GATEWAY,
  buildAlipayConfigUpsertArgs,
  buildAlipayConfigView,
  buildAlipayPaymentRequest,
  buildAlipayPaymentView,
  buildAlipaySdkOptions,
  isAlipayPaidAmountValid,
  isSuccessfulAlipayTradeStatus,
  resolveAlipaySettlementChannel,
  trimTrailingSlash,
} from './alipay.model';

const enabledRow = { appId: 'app1', secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)', enabled: true };

describe('alipay model helpers', () => {
  it('keeps provider and configured mask stable', () => {
    expect(ALIPAY_PROVIDER).toBe('alipay');
    expect(ALIPAY_CONFIGURED_MASK).toBe('已配置(已加密)');
    expect(DEFAULT_ALIPAY_GATEWAY).toBe('https://openapi.alipay.com/gateway.do');
  });

  it('builds masked config views without exposing encrypted or plain keys', () => {
    expect(buildAlipayConfigView(enabledRow)).toEqual({
      appId: 'app1',
      privateKeyMasked: '已配置(已加密)',
      alipayPublicKeyMasked: '已配置(已加密)',
      enabled: true,
    });
    expect(buildAlipayConfigView({ appId: null, secretEnc: null, apiKeyEnc: null, enabled: false })).toEqual({
      appId: null,
      privateKeyMasked: null,
      alipayPublicKeyMasked: null,
      enabled: false,
    });
  });

  it('builds config upsert args with create nulls and sparse encrypted updates', () => {
    expect(buildAlipayConfigUpsertArgs({
      tenantId: 't1',
      appId: 'app1',
      enabled: true,
      secretEnc: 'ENC(priv)',
      apiKeyEnc: 'ENC(pub)',
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'alipay' } },
      create: { tenantId: 't1', provider: 'alipay', appId: 'app1', secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)', enabled: true },
      update: { appId: 'app1', enabled: true, secretEnc: 'ENC(priv)', apiKeyEnc: 'ENC(pub)' },
    });

    expect(buildAlipayConfigUpsertArgs({
      tenantId: 't1',
      appId: 'app2',
      enabled: false,
    })).toEqual({
      where: { tenantId_provider: { tenantId: 't1', provider: 'alipay' } },
      create: { tenantId: 't1', provider: 'alipay', appId: 'app2', secretEnc: null, apiKeyEnc: null, enabled: false },
      update: { appId: 'app2', enabled: false },
    });
  });

  it('builds SDK options with default or provided gateway', () => {
    expect(buildAlipaySdkOptions({
      row: enabledRow,
      privateKey: 'priv',
      alipayPublicKey: 'pub',
    })).toEqual({
      appId: 'app1',
      privateKey: 'priv',
      alipayPublicKey: 'pub',
      gateway: 'https://openapi.alipay.com/gateway.do',
      signType: 'RSA2',
    });
    expect(buildAlipaySdkOptions({
      row: enabledRow,
      privateKey: 'priv',
      alipayPublicKey: 'pub',
      gateway: 'https://sandbox.example/gateway.do',
    }).gateway).toBe('https://sandbox.example/gateway.do');
  });

  it('builds PC payment request with correct URLs, amount, subject, and method', () => {
    const request = buildAlipayPaymentRequest({
      order: { id: 'o1', amountCents: 1000, resource: 'AI', quantity: 100 },
      channel: 'PC',
      publicBaseUrl: 'https://api.example.com/',
      webBaseUrl: 'https://web.example.com/',
    });

    expect(request.method).toBe('alipay.trade.page.pay');
    expect(request.params.method).toBe('GET');
    expect(request.params.notify_url).toBe('https://api.example.com/api/billing/alipay/notify');
    expect(request.params.return_url).toBe('https://web.example.com/#/billing/pay-result?orderId=o1');
    expect(request.params.bizContent).toMatchObject({
      out_trade_no: 'o1',
      total_amount: '10.00',
      subject: '额度购买-AI算力-100',
      product_code: 'FAST_INSTANT_TRADE_PAY',
      timeout_express: '30m',
    });
  });

  it('builds WAP payment request and QR-code subject fallback', () => {
    const request = buildAlipayPaymentRequest({
      order: { id: 'o2', amountCents: 199, resource: 'CODE', quantity: 20 },
      channel: 'WAP',
      publicBaseUrl: 'https://api.example.com',
      webBaseUrl: '',
    });

    expect(request.method).toBe('alipay.trade.wap.pay');
    expect(request.params.method).toBe('POST');
    expect(request.params.return_url).toBe('/#/billing/pay-result?orderId=o2');
    expect(request.params.bizContent.total_amount).toBe('1.99');
    expect(request.params.bizContent.subject).toBe('额度购买-二维码-20');
    expect(request.params.bizContent.product_code).toBe('QUICK_WAP_WAY');
  });

  it('builds channel-specific payment views', () => {
    expect(buildAlipayPaymentView({ orderId: 'o1', channel: 'PC', result: 'https://pay.example' })).toEqual({
      orderId: 'o1',
      channel: 'PC',
      payUrl: 'https://pay.example',
      formHtml: null,
    });
    expect(buildAlipayPaymentView({ orderId: 'o1', channel: 'WAP', result: '<form />' })).toEqual({
      orderId: 'o1',
      channel: 'WAP',
      payUrl: null,
      formHtml: '<form />',
    });
  });

  it('validates notify trade statuses, amounts, settlement channel, and url trimming', () => {
    expect(isSuccessfulAlipayTradeStatus('TRADE_SUCCESS')).toBe(true);
    expect(isSuccessfulAlipayTradeStatus('TRADE_FINISHED')).toBe(true);
    expect(isSuccessfulAlipayTradeStatus('WAIT_BUYER_PAY')).toBe(false);
    expect(isSuccessfulAlipayTradeStatus(undefined)).toBe(false);
    expect(isAlipayPaidAmountValid('10.00', 1000)).toBe(true);
    expect(isAlipayPaidAmountValid('10.005', 1001)).toBe(true);
    expect(isAlipayPaidAmountValid('abc', 1000)).toBe(false);
    expect(isAlipayPaidAmountValid(undefined, 1000)).toBe(false);
    expect(resolveAlipaySettlementChannel(null)).toBe('alipay');
    expect(resolveAlipaySettlementChannel('custom')).toBe('custom');
    expect(trimTrailingSlash('https://api.example.com/')).toBe('https://api.example.com');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/alipay.model.spec.ts
```

Expected: FAIL because `./alipay.model` does not exist.

---

### Task 2: Implement Alipay Model Helpers

**Files:**
- Create: `packages/backend/src/modules/billing/alipay.model.ts`

**Interfaces:**
- Produces helpers consumed by Task 3 exactly as named in Task 1.

- [ ] **Step 1: Implement helpers**

Use this implementation:

```typescript
import type { AlipayConfigView, PaymentView } from '@nongchang/shared';

export const ALIPAY_PROVIDER = 'alipay';
export const ALIPAY_CONFIGURED_MASK = '已配置(已加密)';
export const DEFAULT_ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do';

export interface AlipayRow {
  appId: string | null;
  secretEnc: string | null;
  apiKeyEnc: string | null;
  enabled: boolean;
}

export interface AlipayOrderForPayment {
  id: string;
  amountCents: number;
  resource: string;
  quantity: number;
}

export function buildAlipayConfigView(row: AlipayRow): AlipayConfigView {
  return {
    appId: row.appId ?? null,
    privateKeyMasked: row.secretEnc ? ALIPAY_CONFIGURED_MASK : null,
    alipayPublicKeyMasked: row.apiKeyEnc ? ALIPAY_CONFIGURED_MASK : null,
    enabled: row.enabled,
  };
}

export function buildAlipayConfigUpsertArgs(input: {
  tenantId: string;
  appId: string;
  enabled: boolean;
  secretEnc?: string;
  apiKeyEnc?: string;
}) {
  const update: Record<string, unknown> = { appId: input.appId, enabled: input.enabled };
  if (input.secretEnc) update.secretEnc = input.secretEnc;
  if (input.apiKeyEnc) update.apiKeyEnc = input.apiKeyEnc;
  return {
    where: { tenantId_provider: { tenantId: input.tenantId, provider: ALIPAY_PROVIDER } },
    create: {
      tenantId: input.tenantId,
      provider: ALIPAY_PROVIDER,
      appId: input.appId,
      secretEnc: input.secretEnc ?? null,
      apiKeyEnc: input.apiKeyEnc ?? null,
      enabled: input.enabled,
    },
    update,
  };
}

export function buildAlipaySdkOptions(input: {
  row: AlipayRow;
  privateKey: string;
  alipayPublicKey: string;
  gateway?: string;
}) {
  return {
    appId: input.row.appId as string,
    privateKey: input.privateKey,
    alipayPublicKey: input.alipayPublicKey,
    gateway: input.gateway || DEFAULT_ALIPAY_GATEWAY,
    signType: 'RSA2' as const,
  };
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function buildAlipayPaymentRequest(input: {
  order: AlipayOrderForPayment;
  channel: 'PC' | 'WAP';
  publicBaseUrl: string;
  webBaseUrl: string;
}) {
  const method = input.channel === 'PC' ? 'alipay.trade.page.pay' : 'alipay.trade.wap.pay';
  const productCode = input.channel === 'PC' ? 'FAST_INSTANT_TRADE_PAY' : 'QUICK_WAP_WAY';
  return {
    method,
    params: {
      notify_url: `${trimTrailingSlash(input.publicBaseUrl)}/api/billing/alipay/notify`,
      return_url: `${trimTrailingSlash(input.webBaseUrl)}/#/billing/pay-result?orderId=${input.order.id}`,
      bizContent: {
        out_trade_no: input.order.id,
        total_amount: (input.order.amountCents / 100).toFixed(2),
        subject: `额度购买-${input.order.resource === 'AI' ? 'AI算力' : '二维码'}-${input.order.quantity}`,
        product_code: productCode,
        timeout_express: '30m',
      },
      method: input.channel === 'PC' ? 'GET' : 'POST',
    } as const,
  };
}

export function buildAlipayPaymentView(input: { orderId: string; channel: 'PC' | 'WAP'; result: string }): PaymentView {
  return {
    orderId: input.orderId,
    channel: input.channel,
    payUrl: input.channel === 'PC' ? input.result : null,
    formHtml: input.channel === 'WAP' ? input.result : null,
  };
}

export function isSuccessfulAlipayTradeStatus(status: string | undefined): boolean {
  return status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED';
}

export function isAlipayPaidAmountValid(totalAmount: string | undefined, amountCents: number): boolean {
  const paidYuan = Number(totalAmount);
  return Number.isFinite(paidYuan) && Math.round(paidYuan * 100) === amountCents;
}

export function resolveAlipaySettlementChannel(payChannel: string | null | undefined): string {
  return payChannel ?? ALIPAY_PROVIDER;
}
```

- [ ] **Step 2: Run model tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/alipay.model.spec.ts
```

Expected: PASS.

---

### Task 3: Wire AlipayService

**Files:**
- Modify: `packages/backend/src/modules/billing/alipay.service.ts`

**Interfaces:**
- Consumes helpers from `./alipay.model`.

- [ ] **Step 1: Replace inline pure logic**

Import helpers:

```typescript
import {
  ALIPAY_PROVIDER,
  buildAlipayConfigUpsertArgs,
  buildAlipayConfigView,
  buildAlipayPaymentRequest,
  buildAlipayPaymentView,
  buildAlipaySdkOptions,
  isAlipayPaidAmountValid,
  isSuccessfulAlipayTradeStatus,
  resolveAlipaySettlementChannel,
  trimTrailingSlash,
} from './alipay.model';
import type { AlipayRow, AlipayOrderForPayment } from './alipay.model';
```

Replace:
- Local `PROVIDER` with `ALIPAY_PROVIDER`.
- Local `AlipayRow` interface with imported type.
- `getConfig` response object with `buildAlipayConfigView(row)`.
- `upsertConfig` inline `update/create/where` object with `buildAlipayConfigUpsertArgs({ tenantId: user.tenantId, appId: dto.appId, enabled, secretEnc, apiKeyEnc })`.
- `new AlipaySdk({ ... })` args with `buildAlipaySdkOptions({ row, privateKey: this.enc.decrypt(row.secretEnc), alipayPublicKey: this.enc.decrypt(row.apiKeyEnc), gateway: process.env.ALIPAY_GATEWAY })`.
- `createPayment` method/product/params/return object with `buildAlipayPaymentRequest` and `buildAlipayPaymentView`.
- notify success status check with `isSuccessfulAlipayTradeStatus(status)`.
- notify amount check with `isAlipayPaidAmountValid(tenantHintBody.total_amount, order.amountCents)`.
- notify channel fallback with `resolveAlipaySettlementChannel(order.payChannel)`.
- `publicBaseUrl` and `webBaseUrl` slash trimming with `trimTrailingSlash`.

Keep:
- Role checks and exception messages.
- `findRow` query shape.
- order lookup, owner check, PENDING check.
- SDK `pageExec` call and `checkNotifySign` call.
- app_id cross-check.
- `settleOrder(order, { payChannel: channel, tradeNo })`.
- `publicBaseUrl` missing env exception message.

- [ ] **Step 2: Run focused billing tests**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/billing/alipay.model.spec.ts src/modules/billing/alipay.service.spec.ts
```

Expected: PASS.

---

### Task 4: Verify and Review

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Run full verification**

Run serially:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test:unit
git -c safe.directory=E:/code/nongchang diff --check
```

Expected:
- Build exits `0`.
- Backend unit tests exit `0`.
- `diff --check` exits `0`; LF-to-CRLF warnings are acceptable on Windows if there are no whitespace errors.

- [ ] **Step 2: Review scope**

Review P17 Alipay model boundary. Ensure no controller/DTO/query/SDK/settlement behavior changed. Verify config masking, upsert create/update data, SDK options, payment request params, payment response shape, notify status handling, amount validation, app_id cross-check retention, and settlement channel fallback match previous behavior.

- [ ] **Step 3: Commit**

Run:

```powershell
git -c safe.directory=E:/code/nongchang add docs/superpowers/plans/2026-07-09-p17-alipay-model-boundary.md packages/backend/src/modules/billing/alipay.model.ts packages/backend/src/modules/billing/alipay.model.spec.ts packages/backend/src/modules/billing/alipay.service.ts
git -c safe.directory=E:/code/nongchang diff --cached --check
git -c safe.directory=E:/code/nongchang commit -m "refactor(backend): extract alipay model helpers"
```

Expected: Commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers config masking, config upsert data, SDK options, payment request params, payment response shape, notify status and amount decisions, service wiring, focused tests, full verification, review, and commit.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Helper names and signatures are consistent across tasks.

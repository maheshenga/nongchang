# Session Revocation P6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make password changes, user suspension, and tenant suspension invalidate active access/refresh tokens before natural expiry.

**Architecture:** Add a monotonic `sessionVersion` to `User`, include it in issued JWTs, and have `JwtStrategy` load the current user/tenant on every protected request. A token remains valid only when the user exists, user and tenant are active, and token `sessionVersion` matches the database version.

**Tech Stack:** NestJS Passport JWT strategy, Prisma/PostgreSQL migrations, shared TypeScript contracts, Vitest, pnpm 10.33.2.

---

## File Structure

- Modify: `packages/backend/prisma/schema.prisma`
  - Add `sessionVersion Int @default(0) @map("session_version")` to `User`.
- Create: `packages/backend/prisma/migrations/20260706143000_user_session_version/migration.sql`
  - Add non-null `session_version` with default `0`.
- Modify: `packages/shared/src/types/index.ts`
  - Add optional `sessionVersion?: number` to `AuthUser` for rollout compatibility with existing test fixtures.
- Modify: `packages/backend/src/auth/auth.service.ts`
  - Select/use `sessionVersion` for login, WeChat login, refresh.
  - Reject refresh tokens when their version is stale.
  - Increment `sessionVersion` on password change.
  - Shorten access-token lifetime from `2h` to `15m`.
- Modify/Create: `packages/backend/src/auth/jwt.strategy.spec.ts`
  - Cover valid payload, stale session version, disabled user, disabled tenant, and missing legacy version as `0`.
- Modify: `packages/backend/src/auth/jwt.strategy.ts`
  - Inject `PrismaService`.
  - Validate DB state and session version before returning current `AuthUser`.
- Modify: `packages/backend/src/auth/auth.service.spec.ts`
  - Cover tokens carrying `sessionVersion`.
  - Cover refresh rejecting stale version.
  - Cover password change increments `sessionVersion`.
- Modify: `packages/backend/src/modules/user/user.service.ts`
  - Increment `sessionVersion` when a managed user is suspended.
- Modify: `packages/backend/src/modules/user/user.service.spec.ts`
  - Cover suspend increments session version without leaking it in response.

---

### Task 1: Schema and Shared Contract

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260706143000_user_session_version/migration.sql`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Add migration**

Create `packages/backend/prisma/migrations/20260706143000_user_session_version/migration.sql`:

```sql
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Add Prisma field**

In `packages/backend/prisma/schema.prisma`, add this field in `model User` after `status`:

```prisma
  sessionVersion Int      @default(0) @map("session_version")
```

- [ ] **Step 3: Add shared payload field**

In `packages/shared/src/types/index.ts`, change `AuthUser` to:

```typescript
export interface AuthUser {
  userId: string; tenantId: string; role: Role;
  agentId: string | null; ownerId: string | null;
  sessionVersion?: number;
}
```

- [ ] **Step 4: Validate schema/client**

Run:

```powershell
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/nongchang'
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma generate --schema prisma/schema.prisma
```

Expected: both exit `0`.

---

### Task 2: AuthService Versioned Tokens

**Files:**
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write failing AuthService tests**

Add or update tests in `packages/backend/src/auth/auth.service.spec.ts`:

```typescript
it('password login includes sessionVersion in access token', async () => {
  const hash = await bcrypt.hash('password123', 10);
  const svc = makeService({
    id: 'u1', tenantId: 't1', role: 'merchant', agentId: null,
    status: 'active', passwordHash: hash, sessionVersion: 3,
  });

  const res = await svc.login({ tenantCode: 'DEMO', username: 'merchantA', password: 'password123' });
  const payload = new JwtService({ secret: 'test' }).verify(res.accessToken, { secret: 'test' }) as any;

  expect(payload.sessionVersion).toBe(3);
});
```

In `describe('AuthService.refresh')`, change `makeRefreshSvc` users to include `sessionVersion` where needed, and add:

```typescript
it('rejects stale refresh token when sessionVersion no longer matches DB', async () => {
  const { svc, jwt } = makeRefreshSvc({
    id: 'u1', tenantId: 't1', role: 'merchant', agentId: null,
    status: 'active', sessionVersion: 2, tenant: activeTenant,
  });
  const stale = await jwt.signAsync(
    { userId: 'u1', tenantId: 't1', role: 'merchant', agentId: null, ownerId: 'u1', sessionVersion: 1 },
    { secret: 'test', expiresIn: '7d' },
  );

  await expect(svc.refresh(stale)).rejects.toBeInstanceOf(UnauthorizedException);
});
```

In `describe('AuthService.changePassword')`, update the success assertion:

```typescript
expect(update).toHaveBeenCalledWith({
  where: { id: 'u1' },
  data: {
    passwordHash: newHash,
    sessionVersion: { increment: 1 },
  },
});
```

- [ ] **Step 2: Run AuthService test and verify failure**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.service.spec.ts
```

Expected: new session-version assertions fail before implementation.

- [ ] **Step 3: Implement versioned token behavior**

In `packages/backend/src/auth/auth.service.ts`:

1. Update `toAuthUser` signature and return:

```typescript
  private toAuthUser(user: { id: string; tenantId: string; role: string; agentId: string | null; sessionVersion?: number }): AuthUser {
    return {
      userId: user.id, tenantId: user.tenantId, role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }
```

2. In `refresh`, reject stale token:

```typescript
    const tokenVersion = payload.sessionVersion ?? 0;
    if (!user || user.status !== 'active' || user.tenant.status !== 'active' || (user.sessionVersion ?? 0) !== tokenVersion) {
      throw new UnauthorizedException('刷新令牌无效');
    }
```

3. In `changePassword`, select user id and increment:

```typescript
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, passwordHash: true } });
```

and:

```typescript
    await this.prisma.user.update({
      where: { id: actor.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
```

4. In `issueTokens`, shorten access token:

```typescript
      secret: process.env.JWT_SECRET, expiresIn: '15m',
```

- [ ] **Step 4: Run AuthService test and verify pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/auth.service.spec.ts
```

Expected: AuthService tests pass.

---

### Task 3: JwtStrategy DB Revocation Gate

**Files:**
- Modify: `packages/backend/src/auth/jwt.strategy.ts`
- Create: `packages/backend/src/auth/jwt.strategy.spec.ts`

- [ ] **Step 1: Write failing JwtStrategy tests**

Create `packages/backend/src/auth/jwt.strategy.spec.ts`:

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '@nongchang/shared';
import { JwtStrategy } from './jwt.strategy';

const activeTenant = { status: 'active' };

function makeStrategy(user: any) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
  } as any;
  return { strategy: new JwtStrategy(prisma), prisma };
}

describe('JwtStrategy session revocation', () => {
  it('returns current DB-backed user when token version matches', async () => {
    const { strategy, prisma } = makeStrategy({
      id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
      status: 'active', sessionVersion: 2, tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 2, sub: 'u1',
    })).resolves.toEqual({
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 2,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      include: { tenant: { select: { status: true } } },
    });
  });

  it('treats missing legacy token version as 0', async () => {
    const { strategy } = makeStrategy({
      id: 'u1', tenantId: 't1', role: Role.MEMBER, agentId: null,
      status: 'active', sessionVersion: 0, tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1', tenantId: 't1', role: Role.MEMBER,
      agentId: null, ownerId: null, sub: 'u1',
    })).resolves.toMatchObject({ userId: 'u1', sessionVersion: 0 });
  });

  it('rejects stale access tokens', async () => {
    const { strategy } = makeStrategy({
      id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
      status: 'active', sessionVersion: 3, tenant: activeTenant,
    });

    await expect(strategy.validate({
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 2, sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects disabled users and disabled tenants', async () => {
    await expect(makeStrategy({
      id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
      status: 'suspended', sessionVersion: 0, tenant: activeTenant,
    }).strategy.validate({
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 0, sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(makeStrategy({
      id: 'u1', tenantId: 't1', role: Role.MERCHANT, agentId: null,
      status: 'active', sessionVersion: 0, tenant: { status: 'suspended' },
    }).strategy.validate({
      userId: 'u1', tenantId: 't1', role: Role.MERCHANT,
      agentId: null, ownerId: 'u1', sessionVersion: 0, sub: 'u1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run JwtStrategy test and verify failure**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/jwt.strategy.spec.ts
```

Expected: test fails because `JwtStrategy` does not accept/inject `PrismaService` or check versions.

- [ ] **Step 3: Implement JwtStrategy**

Change `packages/backend/src/auth/jwt.strategy.ts` to:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, Role } from '@nongchang/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: AuthUser & { sub?: string }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: { select: { status: true } } },
    });
    const tokenVersion = payload.sessionVersion ?? 0;
    if (!user || user.status !== 'active' || user.tenant.status !== 'active' || (user.sessionVersion ?? 0) !== tokenVersion) {
      throw new UnauthorizedException('登录状态已失效');
    }
    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      agentId: user.agentId ?? null,
      ownerId: user.role === Role.MERCHANT ? user.id : null,
      sessionVersion: user.sessionVersion ?? 0,
    };
  }
}
```

- [ ] **Step 4: Run JwtStrategy test and verify pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/auth/jwt.strategy.spec.ts
```

Expected: JwtStrategy tests pass.

---

### Task 4: User Suspension Revokes Existing Tokens

**Files:**
- Modify: `packages/backend/src/modules/user/user.service.ts`
- Modify: `packages/backend/src/modules/user/user.service.spec.ts`

- [ ] **Step 1: Write failing user-service test**

In `packages/backend/src/modules/user/user.service.spec.ts`, update the `setStatus 在范围内则改 status` test to assert increment on suspension:

```typescript
expect(prisma.user.update).toHaveBeenCalledWith({
  where: { id: 'm1' },
  data: { status: 'suspended', sessionVersion: { increment: 1 } },
  select: { id: true, status: true },
});
```

Add a test for reactivation not leaking/incrementing unnecessarily:

```typescript
it('setStatus active does not expose sessionVersion', async () => {
  const prisma = makePrisma();
  prisma.user.findFirst.mockResolvedValue({ id: 'm1' });
  prisma.user.update.mockResolvedValue({ id: 'm1', status: 'active' });
  const svc = new UserService(prisma, new ScopeService());

  const r = await svc.setStatus(sysAdmin, 'm1', 'active');

  expect(r).toEqual({ id: 'm1', status: 'active' });
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: 'm1' },
    data: { status: 'active' },
    select: { id: true, status: true },
  });
});
```

- [ ] **Step 2: Run user-service test and verify failure**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.service.spec.ts
```

Expected: suspension increment assertion fails.

- [ ] **Step 3: Implement suspension increment**

In `packages/backend/src/modules/user/user.service.ts`:

```typescript
    const data: Record<string, unknown> = { status };
    if (status === 'suspended') data.sessionVersion = { increment: 1 };
    return this.prisma.user.update({
      where: { id }, data,
      select: { id: true, status: true },
    });
```

- [ ] **Step 4: Run user-service test and verify pass**

Run:

```powershell
corepack pnpm@10.33.2 --filter @nongchang/backend exec vitest run src/modules/user/user.service.spec.ts
```

Expected: user-service tests pass.

---

### Task 5: Final Verification and Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run verification gates**

Run:

```powershell
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/nongchang'
corepack pnpm@10.33.2 --filter @nongchang/backend exec prisma validate --schema prisma/schema.prisma
corepack pnpm@10.33.2 --filter @nongchang/backend exec tsc -p tsconfig.json --noEmit
corepack pnpm@10.33.2 --filter @nongchang/backend build
corepack pnpm@10.33.2 --filter @nongchang/backend test -- src/auth/auth.service.spec.ts src/auth/jwt.strategy.spec.ts src/modules/user/user.service.spec.ts
corepack pnpm@10.33.2 test:unit
git diff --check
corepack pnpm@10.33.2 test:e2e
```

Expected:
- All non-e2e commands exit `0`.
- If `test:e2e` still fails with `Cannot reach PostgreSQL/PostGIS at 127.0.0.1:5544`, record it as an environment blocker and do not claim e2e passed.

- [ ] **Step 2: Request code review**

Ask a reviewer to check:

```text
Review P6 session revocation changes. Requirements: tokens include sessionVersion; JwtStrategy rejects missing users, disabled users, disabled tenants, and stale versions; refresh tokens are rejected after sessionVersion increments; password change and user suspension increment sessionVersion; response payloads do not expose sessionVersion except JWT/internal AuthUser. Check migration safety, compatibility with legacy versionless tokens, and Prisma/Nest injection correctness.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260706143000_user_session_version/migration.sql packages/shared/src/types/index.ts packages/backend/src/auth/auth.service.ts packages/backend/src/auth/auth.service.spec.ts packages/backend/src/auth/jwt.strategy.ts packages/backend/src/auth/jwt.strategy.spec.ts packages/backend/src/modules/user/user.service.ts packages/backend/src/modules/user/user.service.spec.ts docs/superpowers/plans/2026-07-06-session-revocation-p6.md
git commit -m "fix(auth): revoke stale sessions by version"
```

Expected: commit succeeds.

---

## Self-Review

- Spec coverage: password change, user disable, tenant disable, access-token revocation, refresh-token revocation, and shorter access-token lifetime are covered.
- Placeholder scan: no TBD/TODO/fill-later steps.
- Type consistency: `sessionVersion` maps to `session_version`; JWT payload, `AuthUser`, Prisma field, and tests use the same spelling.
- Scope control: no refresh-token blacklist table, no cache, no broad frontend changes.

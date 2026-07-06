import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertDemoSeedAllowed, shouldAllowDemoSeed } from './seed-guard';

describe('demo seed production guard', () => {
  it('blocks direct demo seeding in production without explicit override', () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(false);
    expect(() => assertDemoSeedAllowed(env)).toThrow(/ALLOW_DEMO_SEED=true/);
  });

  it('allows demo seeding in production when ALLOW_DEMO_SEED is explicitly true', () => {
    const env = { NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(true);
    expect(() => assertDemoSeedAllowed(env)).not.toThrow();
  });

  it('allows demo seeding outside production without an override', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

    expect(shouldAllowDemoSeed(env)).toBe(true);
    expect(() => assertDemoSeedAllowed(env)).not.toThrow();
  });
});

describe('demo seed package scripts', () => {
  it('keeps the default prisma:seed script guarded and uses an explicit demo alias for overrides', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['prisma:seed']).toBe('tsx prisma/seed.ts');
    expect(pkg.scripts['prisma:seed:demo']).toBe('tsx scripts/run-demo-seed.ts');
  });
});

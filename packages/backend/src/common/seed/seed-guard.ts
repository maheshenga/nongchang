export function shouldAllowDemoSeed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.ALLOW_DEMO_SEED === 'true';
}

export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (!shouldAllowDemoSeed(env)) {
    throw new Error(
      '[seed guard] Refusing to run demo seed in production. Set ALLOW_DEMO_SEED=true only for an intentional demo-data load.',
    );
  }
}

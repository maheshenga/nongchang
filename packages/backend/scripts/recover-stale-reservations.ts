import { PrismaService } from '../src/prisma/prisma.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { AiBillingCoordinator } from '../src/modules/billing/ai-billing-coordinator';
import type { CreditResource } from '@nongchang/shared';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function resourceArg(): CreditResource | undefined {
  const raw = readArg('resource');
  if (!raw) return undefined;
  if (raw !== 'AI' && raw !== 'CODE') throw new Error('resource must be AI or CODE');
  return raw;
}

async function main() {
  const execute = hasFlag('execute');
  const query = {
    olderThanMinutes: numberArg('older-than-minutes', 60),
    take: numberArg('limit', 100),
    dryRun: !execute,
    resource: resourceArg(),
    refType: readArg('ref-type'),
  };

  if (execute && !query.resource && !query.refType) {
    throw new Error('live recovery requires --resource=AI|CODE or --ref-type=<type>');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const billing = new BillingService(prisma);
    const coordinator = new AiBillingCoordinator(prisma, billing);
    const candidates = query.dryRun ? await billing.listStaleReservations(query) : [];
    const ai = await coordinator.reconcileStale({
      cutoff: new Date(Date.now() - query.olderThanMinutes * 60_000),
      take: query.take,
      dryRun: query.dryRun,
    });
    const generic = query.dryRun
      ? { scanned: candidates.length, released: 0, skipped: candidates.length, errors: [] }
      : await billing.releaseStaleReservations(query);
    console.log(JSON.stringify({
      mode: execute ? 'execute' : 'dry-run',
      filters: {
        olderThanMinutes: query.olderThanMinutes,
        limit: query.take,
        resource: query.resource ?? null,
        refType: query.refType ?? null,
      },
      candidateCount: query.dryRun ? candidates.length : generic.scanned,
      candidates: query.dryRun ? candidates : undefined,
      result: { ai, generic },
    }, null, 2));
    if (ai.errors.length > 0 || generic.errors.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

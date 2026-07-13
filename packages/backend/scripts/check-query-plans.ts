import { PrismaService } from '../src/prisma/prisma.service';

interface PlanNode {
  'Node Type'?: string;
  'Relation Name'?: string;
  'Plan Rows'?: number;
  Plans?: PlanNode[];
}

export interface SequentialScanFinding {
  relation: string;
  planRows: number;
}

export function findLargeSequentialScans(plan: unknown, threshold: number): SequentialScanFinding[] {
  const findings: SequentialScanFinding[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const node = (record.Plan && typeof record.Plan === 'object' ? record.Plan : record) as PlanNode;
    if (node['Node Type'] === 'Seq Scan' && (node['Plan Rows'] ?? 0) > threshold) {
      findings.push({
        relation: node['Relation Name'] ?? 'unknown',
        planRows: node['Plan Rows'] ?? 0,
      });
    }
    if (Array.isArray(node.Plans)) visit(node.Plans);
  };
  visit(plan);
  return findings;
}

const REQUIRED_INDEXES = [
  'trace_scans_tenant_scanned_code_ip_idx',
  'ai_operations_tenant_id_status_created_at_idx',
  'credit_reservations_tenant_id_status_created_at_idx',
  'fields_tenant_id_idx',
  'batches_tenant_id_idx',
  'farm_records_tenant_id_idx',
  'credit_orders_tenant_id_owner_type_owner_id_idx',
] as const;

const PLAN_QUERIES = [
  {
    name: 'anti-fake-window',
    sql: `SELECT code, COUNT(*)
          FROM trace_scans
          WHERE tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
            AND scanned_at >= NOW() - INTERVAL '60 minutes'
          GROUP BY code
          ORDER BY COUNT(*) DESC
          LIMIT 20`,
  },
  {
    name: 'ai-reconciliation',
    sql: `SELECT id FROM ai_operations
          WHERE created_at < NOW() - INTERVAL '60 minutes'
            AND status IN ('RESERVED','FAILED','SUCCEEDED','IN_FLIGHT','REVIEW_REQUIRED')
          ORDER BY created_at ASC LIMIT 100`,
  },
  {
    name: 'batch-page',
    sql: `SELECT id FROM batches
          WHERE tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
          ORDER BY created_at DESC LIMIT 20`,
  },
  {
    name: 'field-page',
    sql: `SELECT id FROM fields
          WHERE tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
          ORDER BY created_at DESC LIMIT 20`,
  },
  {
    name: 'farm-record-page',
    sql: `SELECT id FROM farm_records
          WHERE tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
          ORDER BY created_at DESC LIMIT 20`,
  },
] as const;

export async function runQueryPlanChecks(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const names = new Set(indexes.map((row) => row.indexname));
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !names.has(name));
    const planFailures: Array<{ query: string; scans: SequentialScanFinding[] }> = [];
    for (const query of PLAN_QUERIES) {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `EXPLAIN (FORMAT JSON) ${query.sql}`,
      );
      const plan = rows[0]?.['QUERY PLAN'];
      const scans = findLargeSequentialScans(plan, 1_000);
      if (scans.length > 0) planFailures.push({ query: query.name, scans });
    }
    const extension = await prisma.$queryRaw<Array<{ installed: boolean; preloaded: boolean }>>`
      SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS installed,
        POSITION('pg_stat_statements' IN current_setting('shared_preload_libraries')) > 0 AS preloaded
    `;
    const result = {
      requiredIndexCount: REQUIRED_INDEXES.length,
      missingIndexes,
      planFailures,
      pgStatStatements: extension[0]?.installed === true && extension[0]?.preloaded === true,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (missingIndexes.length || planFailures.length || !result.pgStatStatements) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runQueryPlanChecks().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Query plan check failed'}\n`);
    process.exitCode = 1;
  });
}

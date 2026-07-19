import 'reflect-metadata';
import { EncryptionService } from '../src/common/crypto/encryption.service';
import { OssConfigService } from '../src/modules/oss-config/oss-config.service';
import { OssService } from '../src/modules/upload/oss.service';
import { parseUploadCleanupArgs } from '../src/modules/upload/upload-cleanup.model';
import { UploadQuotaService } from '../src/modules/upload/upload-quota.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const options = parseUploadCleanupArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const quota = new UploadQuotaService(prisma);
    const oss = options.execute
      ? new OssService(new OssConfigService(prisma, new EncryptionService()))
      : null;
    const olderThan = new Date(Date.now() - options.olderThanMinutes * 60_000);
    const assets = await quota.listStalePending(olderThan, options.limit);
    const summary = { mode: options.execute ? 'execute' : 'dry-run', matched: assets.length, deleted: 0, failed: 0 };
    for (const asset of assets) {
      if (!options.execute) continue;
      try {
        await oss!.delete(asset.objectKey, asset.tenantId);
        await quota.release(asset.id, 'DELETED');
        summary.deleted += 1;
      } catch {
        summary.failed += 1;
      }
    }
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Upload cleanup failed'}\n`);
  process.exitCode = 1;
});

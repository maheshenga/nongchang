process.env.ALLOW_DEMO_SEED = 'true';

async function main(): Promise<void> {
  await import('../prisma/seed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

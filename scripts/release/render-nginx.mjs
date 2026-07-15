import { rename, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function renderActiveApi(port) {
  const numericPort = Number(port);
  if (![3001, 3002].includes(numericPort)) throw new Error('active API port must be 3001 or 3002');
  return `proxy_pass http://127.0.0.1:${numericPort};\n`;
}

export async function writeActiveApiAtomic(outputFile, port) {
  const rendered = renderActiveApi(port);
  const tempFile = `${outputFile}.tmp-${process.pid}`;
  await writeFile(tempFile, rendered, { mode: 0o600 });
  await rename(tempFile, outputFile);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--output') options.output = argv[++index];
    else if (argv[index] === '--port') options.port = Number(argv[++index]);
    else throw new Error(`unknown Nginx render argument: ${argv[index]}`);
  }
  if (!options.output || !isAbsolute(options.output)) throw new Error('--output must be absolute');
  return { output: resolve(options.output), port: options.port };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  writeActiveApiAtomic(options.output, options.port)
    .then(() => process.stdout.write(`${JSON.stringify({ status: 'ok', port: options.port })}\n`))
    .catch((error) => {
      process.stderr.write(`Nginx upstream render failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

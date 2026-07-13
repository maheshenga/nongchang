import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

function databaseConfig(databaseUrl, databaseName) {
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use postgresql://');
  }
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: databaseName ?? decodeURIComponent(parsed.pathname.slice(1)),
  };
}

function execution(tool, args, databaseUrl, databaseName) {
  const config = databaseConfig(databaseUrl, databaseName);
  const container = process.env.BACKUP_POSTGRES_CONTAINER?.trim();
  const env = { ...process.env };
  let connectionArgs = [];
  if (tool === 'createdb' || tool === 'dropdb') {
    connectionArgs = ['--username', config.user];
  } else {
    connectionArgs = ['--username', config.user, '--dbname', config.database];
  }

  if (container) {
    return {
      command: 'docker',
      args: ['exec', '-i', container, tool, ...connectionArgs, ...args],
      env,
    };
  }

  env.PGHOST = config.host;
  env.PGPORT = config.port;
  env.PGUSER = config.user;
  env.PGPASSWORD = config.password;
  const binDir = process.env.PG_BIN_DIR?.trim();
  const command = binDir ? `${binDir.replace(/[\\/]$/, '')}/${tool}` : tool;
  return { command, args: [...connectionArgs, ...args], env };
}

export async function runPostgresTool(tool, args, options) {
  const { command, args: finalArgs, env } = execution(tool, args, options.databaseUrl, options.databaseName);
  let stdout = '';
  await new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { if (stdout.length < 1_000_000) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < 16_384) stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim().slice(0, 2_000)}`));
    });
  });
  return stdout.trim();
}

export async function runPostgresToolToFile(tool, args, outputPath, options) {
  const { command, args: finalArgs, env } = execution(tool, args, options.databaseUrl, options.databaseName);
  const output = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
  const child = spawn(command, finalArgs, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { if (stderr.length < 16_384) stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim().slice(0, 2_000)}`));
    });
  });
  await Promise.all([pipeline(child.stdout, output), completed]);
}

export async function runPostgresToolFromFile(tool, args, inputPath, options) {
  const { command, args: finalArgs, env } = execution(tool, args, options.databaseUrl, options.databaseName);
  await new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, { env, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { if (stderr.length < 16_384) stderr += chunk; });
    const input = createReadStream(inputPath);
    input.once('error', reject);
    input.pipe(child.stdin);
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim().slice(0, 2_000)}`));
    });
  });
}

export function databaseNameFromUrl(databaseUrl) {
  return databaseConfig(databaseUrl).database;
}

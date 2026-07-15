const path = require('node:path');

const releaseDir = process.env.NONGCHANG_RELEASE_DIR;
const nodeInterpreter = process.env.NONGCHANG_NODE_BIN;

if (!releaseDir) throw new Error('NONGCHANG_RELEASE_DIR is required');
if (!nodeInterpreter) throw new Error('NONGCHANG_NODE_BIN must point to the dedicated Node.js 20 binary');

const script = path.join(releaseDir, 'backend/src/main.js');
const sharedRoot = path.resolve(releaseDir, '../..', 'shared');
const common = {
  script,
  cwd: releaseDir,
  interpreter: nodeInterpreter,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  min_uptime: '10s',
  max_restarts: 10,
  restart_delay: 2000,
  kill_timeout: 15000,
  listen_timeout: 15000,
  time: false,
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'nongchang-api-blue',
      max_memory_restart: '768M',
      out_file: path.join(sharedRoot, 'logs/nongchang-api-blue.out.log'),
      error_file: path.join(sharedRoot, 'logs/nongchang-api-blue.error.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3001',
        OPERATIONS_WORKERS_ENABLED: 'false',
      },
    },
    {
      ...common,
      name: 'nongchang-api-green',
      max_memory_restart: '768M',
      out_file: path.join(sharedRoot, 'logs/nongchang-api-green.out.log'),
      error_file: path.join(sharedRoot, 'logs/nongchang-api-green.error.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3002',
        OPERATIONS_WORKERS_ENABLED: 'false',
      },
    },
    {
      ...common,
      name: 'nongchang-worker',
      max_memory_restart: '512M',
      out_file: path.join(sharedRoot, 'logs/nongchang-worker.out.log'),
      error_file: path.join(sharedRoot, 'logs/nongchang-worker.error.log'),
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3003',
        OPERATIONS_WORKERS_ENABLED: 'true',
      },
    },
  ],
};

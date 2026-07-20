export interface BrowserServerConfig {
  backendPort: number;
  webPort: number;
  backendUrl: string;
  webUrl: string;
  reuseExistingServer: boolean;
}

function readPort(raw: string | undefined, fallback: number, name: string): number {
  const value = raw?.trim() ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer from 1024 through 65535`);
  }
  return value;
}

export function resolveBrowserServerConfig(env: NodeJS.ProcessEnv): BrowserServerConfig {
  const backendPort = readPort(env.E2E_BACKEND_PORT, 3101, 'E2E_BACKEND_PORT');
  const webPort = readPort(env.E2E_WEB_PORT, 4175, 'E2E_WEB_PORT');
  if (backendPort === webPort) throw new Error('E2E_BACKEND_PORT and E2E_WEB_PORT must differ');
  return {
    backendPort,
    webPort,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: env.E2E_REUSE_SERVERS === 'true',
  };
}

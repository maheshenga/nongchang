import { BeforeApplicationShutdown, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RUNTIME_STATE, type RuntimeStateStore } from '../../common/runtime/runtime-state.types';

@Injectable()
export class HealthService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RUNTIME_STATE) private readonly runtimeState: RuntimeStateStore,
  ) {}

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  live() {
    const deployedGitSha = process.env.DEPLOYED_GIT_SHA;
    return {
      status: 'ok' as const,
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? '0.0.0',
      ...(/^[0-9a-f]{40}$/.test(deployedGitSha ?? '') ? { deployedGitSha } : {}),
    };
  }

  async ready() {
    if (this.shuttingDown) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (!(await this.runtimeState.ping())) throw new Error('runtime state unavailable');
      return { status: 'ready' as const };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

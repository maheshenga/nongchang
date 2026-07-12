import { BeforeApplicationShutdown, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService implements BeforeApplicationShutdown {
  private shuttingDown = false;

  constructor(private readonly prisma: PrismaService) {}

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
  }

  live() {
    return {
      status: 'ok' as const,
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }

  async ready() {
    if (this.shuttingDown) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' as const };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

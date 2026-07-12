import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return {
      status: 'ok' as const,
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }

  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' as const };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

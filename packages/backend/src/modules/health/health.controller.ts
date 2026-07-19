import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @Public()
  live() {
    return this.health.live();
  }

  @Get('ready')
  @Public()
  ready() {
    return this.health.ready();
  }
}

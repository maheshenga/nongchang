import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  publicLegalQuerySchema,
  type PublicLegalQuery,
} from '@nongchang/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LegalService } from './legal.service';

const PUBLIC_LEGAL_LIMIT = process.env.NODE_ENV === 'test' ? 100_000 : 60;

@Controller('public/legal')
export class PublicLegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: PUBLIC_LEGAL_LIMIT } })
  @Get()
  get(
    @Query(new ZodValidationPipe(publicLegalQuerySchema)) query: PublicLegalQuery,
  ) {
    return this.legal.getPublic(query);
  }
}

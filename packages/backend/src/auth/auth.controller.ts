import { Body, Controller, Post } from '@nestjs/common';
import { loginSchema, refreshSchema } from '@nongchang/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: any) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: any) {
    return this.auth.refresh(dto.refreshToken);
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { loginSchema, refreshSchema, wechatLoginSchema, LoginDto, RefreshDto, WechatLoginDto } from '@nongchang/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('wechat')
  loginWechat(@Body(new ZodValidationPipe(wechatLoginSchema)) dto: WechatLoginDto) {
    return this.auth.loginWechat(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

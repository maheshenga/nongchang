import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  loginSchema, refreshSchema, wechatLoginSchema, wechatRegisterSchema,
  updateMeSchema, changePasswordSchema,
  LoginDto, RefreshDto, WechatLoginDto, WechatRegisterDto, UpdateMeDto, ChangePasswordDto, AuthUser,
} from '@nongchang/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  @Post('wechat/register')
  registerWechat(@Body(new ZodValidationPipe(wechatRegisterSchema)) dto: WechatRegisterDto) {
    return this.auth.registerWechat(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // ── 个人账号 ── 无 @Public/@Roles:全局 JwtAuthGuard 要求登录,任意角色可访问本人资料。
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.auth.getMe(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateMeSchema)) dto: UpdateMeDto) {
    return this.auth.updateMe(user, dto);
  }

  @Post('me/password')
  changePassword(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  loginSchema, refreshSchema, wechatLoginSchema, wechatRegisterSchema,
  miniappLoginSchema, miniappWechatLoginSchema, miniappWechatRegisterSchema,
  updateMeSchema, changePasswordSchema,
  LoginDto, RefreshDto, WechatLoginDto, WechatRegisterDto, UpdateMeDto, ChangePasswordDto, AuthUser,
  WebAccessTokenResponse, MiniappLoginDto, MiniappWechatLoginDto, MiniappWechatRegisterDto,
} from '@nongchang/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  buildExpiredWebRefreshCookie,
  buildWebRefreshCookie,
  parseWebRefreshCookie,
} from './web-session';

// 凭据类端点(登录/微信登录/注册)的防撞库限流:每 IP 60s 内最多 10 次。
// 测试环境放到极高阈值,避免 e2e 中跨文件大量登录误触限流。
const CREDENTIAL_LIMIT = process.env.NODE_ENV === 'test' ? 100_000 : 10;

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('login')
  login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('miniapp/login')
  loginMiniapp(@Body(new ZodValidationPipe(miniappLoginSchema)) dto: MiniappLoginDto) {
    return this.auth.loginMiniapp(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('miniapp/wechat')
  loginWechatMiniapp(
    @Body(new ZodValidationPipe(miniappWechatLoginSchema)) dto: MiniappWechatLoginDto,
  ) {
    return this.auth.loginWechatMiniapp(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('miniapp/wechat/register')
  registerWechatMiniapp(
    @Body(new ZodValidationPipe(miniappWechatRegisterSchema)) dto: MiniappWechatRegisterDto,
  ) {
    return this.auth.registerWechatMiniapp(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('wechat')
  loginWechat(@Body(new ZodValidationPipe(wechatLoginSchema)) dto: WechatLoginDto) {
    return this.auth.loginWechat(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('wechat/register')
  registerWechat(@Body(new ZodValidationPipe(wechatRegisterSchema)) dto: WechatRegisterDto) {
    return this.auth.registerWechat(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('wechat/register/status')
  getWechatRegistrationStatus(@Body(new ZodValidationPipe(wechatLoginSchema)) dto: WechatLoginDto) {
    return this.auth.getWechatRegistrationStatus(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('web/login')
  async webLogin(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebAccessTokenResponse> {
    const tokens = await this.auth.login(dto);
    response.setHeader(
      'Set-Cookie',
      buildWebRefreshCookie(tokens.refreshToken, process.env.NODE_ENV === 'production'),
    );
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: CREDENTIAL_LIMIT } })
  @Post('web/session')
  async webSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebAccessTokenResponse | undefined> {
    const refreshToken = parseWebRefreshCookie(request.headers.cookie);
    if (!refreshToken) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }

    const tokens = await this.auth.refresh(refreshToken);
    response.setHeader(
      'Set-Cookie',
      buildWebRefreshCookie(tokens.refreshToken, process.env.NODE_ENV === 'production'),
    );
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('web/refresh')
  async webRefresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WebAccessTokenResponse> {
    const refreshToken = parseWebRefreshCookie(request.headers.cookie);
    if (!refreshToken) throw new UnauthorizedException('刷新令牌无效');

    const tokens = await this.auth.refresh(refreshToken);
    response.setHeader(
      'Set-Cookie',
      buildWebRefreshCookie(tokens.refreshToken, process.env.NODE_ENV === 'production'),
    );
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('web/logout')
  webLogout(@Res({ passthrough: true }) response: Response): undefined {
    response.setHeader(
      'Set-Cookie',
      buildExpiredWebRefreshCookie(process.env.NODE_ENV === 'production'),
    );
    return undefined;
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

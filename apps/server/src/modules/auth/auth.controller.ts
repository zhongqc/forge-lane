import { ApiBody } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { parse } from '../../common/validation.js';
import { fail } from '../../common/errors.js';
@Controller('api')
export class AuthController {
  private attempts = new Map<string, { count: number; reset: number }>();
  constructor(@Inject(AuthService) private auth: AuthService) {}
  private rate(req: Request) {
    const key = req.ip || 'local';
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.reset < now) this.attempts.delete(k);
    const v = this.attempts.get(key) || { count: 0, reset: now + 60000 };
    v.count++;
    this.attempts.set(key, v);
    if (v.count > 20) fail(429, '尝试过于频繁，请稍后重试');
  }
  private cookie(res: Response, token: string) {
    res.cookie('forge_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.COOKIE_SECURE === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
      maxAge: 7 * 86400000,
      path: '/',
    });
  }
  @ApiBody({ type: RegisterDto })
  @Post('auth/register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.rate(req);
    this.cookie(res, await this.auth.register(parse(RegisterDto, body)));
    return { ok: true };
  }
  @ApiBody({ type: LoginDto })
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.rate(req);
    this.cookie(res, await this.auth.login(parse(LoginDto, body)));
    return { ok: true };
  }
  @Post('auth/logout') @HttpCode(200) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.cookies?.forge_session);
    res.clearCookie('forge_session', { path: '/' });
    return { ok: true };
  }
  @Get('me') me(@Req() req: Request) {
    return this.auth.current(req.cookies?.forge_session, req.cookies?.forge_workspace);
  }
}

import { ApiBody } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Req, Res, UseGuards, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { IsEmail, IsIn, IsUUID } from 'class-validator';
import { WorkspaceService } from './workspace.service.js';
import { parse } from '../../common/validation.js';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
class WorkspaceMemberDto {
  @IsEmail() email!: string;
  @IsIn(['MEMBER', 'VIEWER']) role!: 'MEMBER' | 'VIEWER';
}
class WorkspaceSelectDto {
  @IsUUID() workspaceId!: string;
}
@Controller('api')
@UseGuards(SessionGuard)
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private service: WorkspaceService) {}
  @Get('workspaces') list(@Req() req: AuthRequest) {
    return this.service.list(req.actorContext);
  }
  @ApiBody({ type: WorkspaceSelectDto })
  @Post('workspaces/select')
  async select(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response, @Body() b: unknown) {
    const input = parse(WorkspaceSelectDto, b);
    await this.service.select(req.actorContext, input.workspaceId);
    res.cookie('forge_workspace', input.workspaceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.COOKIE_SECURE === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
      path: '/',
    });
    return { ok: true };
  }
  @ApiBody({ type: WorkspaceMemberDto })
  @Post('workspace/members')
  add(@Req() req: AuthRequest, @Body() b: unknown) {
    return this.service.add(req.actorContext, parse(WorkspaceMemberDto, b));
  }
}

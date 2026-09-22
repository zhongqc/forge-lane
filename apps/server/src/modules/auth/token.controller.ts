import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { randomBytes } from 'node:crypto';
import { SessionGuard, type AuthRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { AccessService } from './access.service.js';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import { parse } from '../../common/validation.js';
class TokenDto {
  @IsString() @Length(1, 100) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) projectIds!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsIn(['read', 'write'], { each: true }) scopes!: string[];
  @IsInt() @Min(1) @Max(90) expiresInDays = 30;
}
const publicToken = {
  id: true,
  name: true,
  projectIds: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;
@Controller('api/auth')
@UseGuards(SessionGuard)
export class TokenController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AuthService) private auth: AuthService,
    @Inject(AccessService) private access: AccessService,
  ) {}
  @Post('tokens') async create(@Req() req: AuthRequest, @Body() body: unknown) {
    const c = req.actorContext;
    if (c.token) fail(403, '必须使用网页登录');
    const input = parse(TokenDto, body);
    if (!input.name.trim() || !input.scopes.includes('read')) fail(400, '令牌必须包含名称和 read 权限');
    for (const id of input.projectIds)
      await this.access.project(c, id, input.scopes.includes('write') ? 'WRITE' : 'READ');
    const token = 'forge_' + randomBytes(32).toString('hex');
    const row = await this.db.client.apiToken.create({
      data: {
        name: input.name.trim(),
        actorId: c.actorId,
        workspaceId: c.workspaceId,
        projectIds: input.projectIds,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + input.expiresInDays * 86400000),
        digest: this.auth.digest(token),
      },
    });
    return { token, id: row.id, expiresAt: row.expiresAt };
  }
  @Get('tokens') list(@Req() req: AuthRequest) {
    return this.db.client.apiToken.findMany({
      where: { actorId: req.actorContext.actorId, workspaceId: req.actorContext.workspaceId },
      select: publicToken,
      orderBy: { createdAt: 'desc' },
    });
  }
  @Delete('tokens/:id') async revoke(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.db.client.apiToken.updateMany({
      where: { id, actorId: req.actorContext.actorId, workspaceId: req.actorContext.workspaceId },
      data: { revokedAt: new Date() },
    });
    if (!result.count) fail(404, '令牌不存在');
    return { ok: true };
  }
  @Get('whoami') async whoami(@Req() req: AuthRequest) {
    if (req.headers.authorization) return this.auth.bearer(req.headers.authorization.slice(7));
    const me = await this.auth.current(req.cookies?.forge_session, req.cookies?.forge_workspace);
    return { actor: me.actor, workspace: me.workspace };
  }
}

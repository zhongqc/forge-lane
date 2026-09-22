import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Param,
  Inject,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { SessionGuard, type AuthRequest } from '../auth/auth.guard.js';
import { GitHubService } from './github.service.js';
import { ConnectGitHubDto, UpdateGitHubDto } from './github.dto.js';
import { parse } from '../../common/validation.js';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
@Controller('api')
@UseGuards(SessionGuard)
export class GitHubController {
  constructor(@Inject(GitHubService) private service: GitHubService) {}
  @Get('projects/:id/github') settings(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.settings(r.actorContext, id);
  }
  @Post('projects/:id/github') connect(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.connect(r.actorContext, id, parse(ConnectGitHubDto, body));
  }
  @Patch('projects/:id/github/:repoId') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('repoId', ParseUUIDPipe) repoId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(r.actorContext, id, repoId, parse(UpdateGitHubDto, body));
  }
  @Post('projects/:id/github/:repoId/sync') sync(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('repoId', ParseUUIDPipe) repoId: string,
  ) {
    return this.service.sync(r.actorContext, id, repoId);
  }
  @Get('issues/:id/development') development(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.development(r.actorContext, id);
  }
}
@Controller('api/github')
export class GitHubWebhookController {
  constructor(@Inject(Db) private db: Db) {}
  @Post('webhook')
  @HttpCode(202)
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) fail(503, 'Webhook 尚未配置');
    const signature = req.header('x-hub-signature-256') ?? '';
    if (!req.rawBody || !/^sha256=[a-f0-9]{64}$/.test(signature)) fail(401, 'Webhook 签名无效');
    const expected = createHmac('sha256', secret).update(req.rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) fail(401, 'Webhook 签名无效');
    const id = req.header('x-github-delivery') ?? '',
      event = req.header('x-github-event') ?? '';
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) fail(400, '缺少有效 delivery ID');
    if (!['pull_request', 'push', 'installation', 'installation_repositories', 'ping'].includes(event))
      return { ignored: true };
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '事件格式无效');
    await this.db.client.gitHubDelivery.createMany({
      data: [{ id, event, payload: body as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    return { accepted: true };
  }
}

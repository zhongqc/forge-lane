import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fail } from '../../common/errors.js';
import { AuthService } from './auth.service.js';
import type { Request } from 'express';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
export type AuthRequest = Request & { actorContext: ActorContext };
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = req.headers.authorization;
    if (authorization && !/^Bearer \S+$/i.test(authorization)) fail(401, '无效认证', 'UNAUTHENTICATED');
    const me = authorization
      ? await this.auth.bearer(authorization.slice(7))
      : await this.auth.current(req.cookies?.forge_session, req.cookies?.forge_workspace);
    const token = 'token' in me ? me.token : undefined;
    if (token) {
      // Route metadata avoids case/encoding differences in Express URL matching.
      const controller = context.getClass().name;
      const handler = context.getHandler().name;
      const allowed = [
        'IssueController',
        'ExecutionController',
        'ProjectController',
        'BoardController',
        'SprintController',
        'TokenController',
      ];
      if (
        (!allowed.includes(controller) &&
          !(controller === 'GitHubController' && handler === 'development')) ||
        (controller === 'TokenController' && handler === 'create')
      )
        fail(403, '此操作必须使用网页登录');
      if (
        !['GET', 'HEAD'].includes(req.method) &&
        !token.scopes.includes('write') &&
        !(controller === 'TokenController' && handler === 'revoke')
      )
        fail(403, '令牌仅允许读取');
    }
    req.actorContext = {
      actorId: me.actor.id,
      workspaceId: me.workspace.id,
      actorName: me.actor.name,
      source: token ? 'API' : 'WEB',
      ...(token ? { token } : {}),
      requestId: randomUUID(),
    };
    return true;
  }
}

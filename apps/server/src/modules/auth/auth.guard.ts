import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from './auth.service.js';
import type { Request } from 'express';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
export type AuthRequest = Request & { actorContext: ActorContext };
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const me = await this.auth.current(req.cookies?.forge_session, req.cookies?.forge_workspace);
    req.actorContext = {
      actorId: me.actor.id,
      workspaceId: me.workspace.id,
      actorName: me.actor.name,
      source: 'WEB',
      requestId: randomUUID(),
    };
    return true;
  }
}

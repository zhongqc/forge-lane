import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import { AccessService } from '../auth/access.service.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AccessService) private access: AccessService,
  ) {}
  list(c: ActorContext) {
    return this.db.client.workspaceMember.findMany({
      where: { actorId: c.actorId },
      include: { workspace: true },
    });
  }
  async select(c: ActorContext, workspaceId: string) {
    const membership = await this.db.client.workspaceMember.findUnique({
      where: { workspaceId_actorId: { workspaceId, actorId: c.actorId } },
    });
    if (!membership) fail(403, '无法访问此工作区');
  }
  async add(c: ActorContext, input: { email: string; role: 'MEMBER' | 'VIEWER' }) {
    await this.access.workspace(c, true);
    const user = await this.db.client.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: { actor: true },
    });
    if (!user?.actor) fail(422, '请让该成员先使用此邮箱注册，再加入团队');
    const where = { workspaceId_actorId: { workspaceId: c.workspaceId, actorId: user.actor.id } };
    const existing = await this.db.client.workspaceMember.findUnique({ where });
    if (existing?.role === 'ADMIN') fail(422, '不能在此修改工作区管理员');
    return this.db.client.workspaceMember.upsert({
      where,
      create: { workspaceId: c.workspaceId, actorId: user.actor.id, role: input.role },
      update: { role: input.role },
    });
  }
}

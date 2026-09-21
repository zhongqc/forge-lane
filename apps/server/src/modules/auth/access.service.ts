import { Injectable, Inject } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
@Injectable()
export class AccessService {
  constructor(@Inject(Db) private db: Db) {}
  async workspace(c: ActorContext, admin = false) {
    const m = await this.db.client.workspaceMember.findUnique({
      where: { workspaceId_actorId: { workspaceId: c.workspaceId, actorId: c.actorId } },
    });
    if (!m || (admin && m.role !== 'ADMIN')) fail(403, '没有执行此操作的权限');
    return m;
  }
  async project(c: ActorContext, id: string, mode: 'READ' | 'WRITE' | 'ADMIN' = 'READ') {
    const p = await this.db.client.project.findUnique({
      where: { id },
      include: { members: { where: { actorId: c.actorId } } },
    });
    if (!p || p.workspaceId !== c.workspaceId) fail(404, '项目不存在');
    const wm = await this.workspace(c);
    const role = wm.role === 'ADMIN' ? 'ADMIN' : p.members[0]?.role;
    if (!role) fail(404, '项目不存在');
    if ((mode === 'WRITE' && role === 'VIEWER') || (mode === 'ADMIN' && role !== 'ADMIN'))
      fail(403, '没有编辑权限');
    return p;
  }
  async issue(c: ActorContext, id: string, write = false) {
    const issue = await this.db.client.issue.findUnique({ where: { id } });
    if (!issue) fail(404, '事项不存在');
    await this.project(c, issue.projectId, write ? 'WRITE' : 'READ');
    return issue;
  }
}

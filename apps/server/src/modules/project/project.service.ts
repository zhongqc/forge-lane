import { CommandService } from '../../common/command.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from './project.repository.js';
import { AccessService } from '../auth/access.service.js';
import { conflict, fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { CreateProjectDto, UpdateProjectDto, MemberDto, LabelDto, StatusDto } from './project.dto.js';
export const DEFAULT_COLUMNS = [
  {
    name: '待办',
    statuses: [
      ['Todo', 'TODO'],
      ['Ready', 'TODO'],
    ],
  },
  {
    name: '开发中',
    statuses: [
      ['In Progress', 'IN_PROGRESS'],
      ['Code Review', 'IN_PROGRESS'],
    ],
  },
  {
    name: '测试中',
    statuses: [
      ['Ready for Test', 'IN_PROGRESS'],
      ['Testing', 'IN_PROGRESS'],
      ['Ready for Release', 'IN_PROGRESS'],
    ],
  },
  { name: '已完成', statuses: [['Done', 'DONE']] },
] as const;
@Injectable()
export class ProjectService {
  constructor(
    @Inject(CommandService) private commands: CommandService,
    @Inject(ActivityRepository) private activity: ActivityRepository,
    @Inject(ProjectRepository) private repo: ProjectRepository,
    @Inject(AccessService) private access: AccessService,
  ) {}
  async list(c: ActorContext) {
    const wm = await this.access.workspace(c);
    return this.repo.db.client.project.findMany({
      where: {
        workspaceId: c.workspaceId,
        ...(c.token ? { id: { in: c.token.projectIds } } : {}),
        ...(wm.role === 'ADMIN' ? {} : { members: { some: { actorId: c.actorId } } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async create(c: ActorContext, input: CreateProjectDto) {
    await this.access.workspace(c, true);
    return this.commands.run(c, 'project-config', undefined, input, async (tx) => {
      const p = await tx.project.create({
        data: {
          key: input.key,
          description: input.description,
          name: input.name.trim(),
          workspaceId: c.workspaceId,
          members: { create: { actorId: c.actorId, role: 'ADMIN' } },
        },
      });
      let order = 0;
      for (const [index, col] of DEFAULT_COLUMNS.entries()) {
        const column = await tx.boardColumn.create({
          data: { projectId: p.id, name: col.name, sortOrder: index },
        });
        for (const [name, category] of col.statuses) {
          const status = await tx.status.create({
            data: { projectId: p.id, name, category, sortOrder: order++ },
          });
          await tx.boardColumnStatus.create({
            data: { projectId: p.id, columnId: column.id, statusId: status.id, sortOrder: status.sortOrder },
          });
        }
      }
      await this.activity.append(tx, c, p.id, null, 'PROJECT_CREATED', { name: p.name, key: p.key });
      return p;
    });
  }
  async update(c: ActorContext, id: string, input: UpdateProjectDto) {
    await this.access.project(c, id, 'ADMIN');
    return this.commands.run(c, `project:${id}`, undefined, input, async (tx) => {
      const previous = await tx.project.findUniqueOrThrow({ where: { id } });
      const { version, ...data } = input;
      const r = await tx.project.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!r.count) conflict();
      await this.activity.append(tx, c, id, null, 'PROJECT_UPDATED', {
        before: { name: previous.name, description: previous.description },
        after: data,
      });
      return tx.project.findUnique({ where: { id } });
    });
  }

  async repositories(c: ActorContext, id: string) {
    await this.access.project(c, id, 'READ');
    const repositories = await this.repo.db.client.gitHubRepository.findMany({
      where: { projectId: id },
      select: { id: true, fullName: true, enabled: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return repositories.map((repository) => ({
      ...repository,
      url: `https://github.com/${repository.fullName}`,
    }));
  }
  async members(c: ActorContext, id: string) {
    const p = await this.access.project(c, id);
    const memberships = await this.repo.db.client.workspaceMember.findMany({
      where: { workspaceId: p.workspaceId },
      include: {
        actor: { select: { id: true, name: true, color: true, avatarKey: true, kind: true, active: true } },
      },
    });
    const projectMembers = await this.repo.db.client.projectMember.findMany({ where: { projectId: id } });
    return memberships.map((m) => ({
      ...m.actor,
      workspaceRole: m.role,
      role: projectMembers.find((p) => p.actorId === m.actorId)?.role ?? null,
    }));
  }
  async member(c: ActorContext, id: string, input: MemberDto) {
    await this.access.project(c, id, 'ADMIN');
    const exists = await this.repo.db.client.workspaceMember.findUnique({
      where: { workspaceId_actorId: { workspaceId: c.workspaceId, actorId: input.actorId } },
    });
    if (!exists) fail(422, '成员不属于此工作区');
    return this.commands.run(c, `members:${id}`, undefined, input, async (tx) => {
      const where = { projectId_actorId: { projectId: id, actorId: input.actorId } };
      const before = await tx.projectMember.findUnique({ where });
      await this.activity.append(tx, c, id, null, 'MEMBER_UPDATED', {
        actorId: input.actorId,
        before: before?.role ?? null,
        after: input.role,
      });
      if (input.role === 'NONE')
        return tx.projectMember.deleteMany({ where: { projectId: id, actorId: input.actorId } });
      return tx.projectMember.upsert({
        where,
        create: { projectId: id, actorId: input.actorId, role: input.role },
        update: { role: input.role },
      });
    });
  }

  async label(c: ActorContext, id: string, input: LabelDto) {
    await this.access.project(c, id, 'WRITE');
    return this.commands.run(c, `labels:${id}`, undefined, input, async (tx) => {
      const label = await tx.label.create({
        data: { projectId: id, name: input.name.trim(), color: input.color },
      });
      await this.activity.append(tx, c, id, null, 'LABEL_CREATED', { id: label.id, name: label.name });
      return label;
    });
  }
  async status(c: ActorContext, id: string, input: StatusDto, statusId?: string) {
    await this.access.project(c, id, 'ADMIN');
    const col = await this.repo.db.client.boardColumn.findFirst({
      where: { id: input.columnId, projectId: id },
    });
    if (!col) fail(422, '目标列不属于此项目');
    return this.commands.run(c, 'project-config', undefined, input, async (tx) => {
      const updated = await tx.project.updateMany({
        where: { id, version: input.version },
        data: { version: { increment: 1 } },
      });
      if (!updated.count) conflict();
      if (statusId && !(await tx.status.findFirst({ where: { id: statusId, projectId: id } })))
        fail(404, '状态不存在');
      const count = await tx.status.count({ where: { projectId: id } });
      const data = { name: input.name.trim(), category: input.category };
      const s = statusId
        ? await tx.status.update({ where: { id: statusId }, data })
        : await tx.status.create({ data: { ...data, projectId: id, sortOrder: count } });
      await tx.boardColumnStatus.upsert({
        where: { statusId: s.id },
        create: { projectId: id, columnId: col.id, statusId: s.id, sortOrder: s.sortOrder },
        update: { columnId: col.id },
      });
      if (input.sortOrder !== undefined) {
        const rows = await tx.status.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } });
        const ordered = rows.filter((row) => row.id !== s.id);
        ordered.splice(Math.min(input.sortOrder, ordered.length), 0, s);
        for (const [sortOrder, row] of ordered.entries()) {
          await tx.status.update({ where: { id: row.id }, data: { sortOrder } });
          await tx.boardColumnStatus.update({ where: { statusId: row.id }, data: { sortOrder } });
        }
      }
      await this.activity.append(tx, c, id, null, 'WORKFLOW_UPDATED', {
        statusId: s.id,
        name: s.name,
        columnId: col.id,
        category: s.category,
      });
      return s;
    });
  }
  async deleteStatus(c: ActorContext, id: string, statusId: string) {
    await this.access.project(c, id, 'ADMIN');
    return this.commands.run(c, 'project-config', undefined, { statusId }, async (tx) => {
      if (!(await tx.status.findFirst({ where: { id: statusId, projectId: id } }))) fail(404, '状态不存在');
      if (await tx.issue.count({ where: { statusId } })) fail(422, '此状态仍被事项使用，请先移动这些事项');
      if ((await tx.status.count({ where: { projectId: id } })) <= 1) fail(422, '至少保留一个状态');
      const removed = await tx.status.delete({ where: { id: statusId } });
      await this.activity.append(tx, c, id, null, 'WORKFLOW_STATUS_DELETED', {
        statusId,
        name: removed.name,
      });
      return { ok: true };
    });
  }
}

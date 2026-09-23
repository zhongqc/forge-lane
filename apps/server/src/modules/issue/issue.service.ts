import { NotificationService } from '../notification/notification.service.js';
import { Injectable, Inject } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { CommandService } from '../../common/command.service.js';
import { AccessService } from '../auth/access.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { IssueRepository, issueInclude, mapIssue } from './issue.repository.js';
import { assertIssueShape } from './domain/issue.policy.js';
import { conflict, fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type { CreateIssueDto, UpdateIssueDto, IssueFieldsDto, CommentDto } from './issue.dto.js';
@Injectable()
export class IssueService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(NotificationService) private notifications: NotificationService,
    @Inject(CommandService) private commands: CommandService,
    @Inject(AccessService) private access: AccessService,
    @Inject(ActivityRepository) private activity: ActivityRepository,
    @Inject(IssueRepository) private repo: IssueRepository,
  ) {}
  async validate(
    tx: Prisma.TransactionClient,
    c: ActorContext,
    projectId: string,
    input: IssueFieldsDto & { type: string; title?: string },
    id?: string,
  ) {
    try {
      assertIssueShape(input);
    } catch (e) {
      fail(422, (e as Error).message);
    }
    if (input.title !== undefined && !input.title.trim()) fail(422, '标题不能为空');
    if (input.statusId && !(await tx.status.findFirst({ where: { id: input.statusId, projectId } })))
      fail(422, '状态不属于此项目');
    if (input.epicId) {
      const epic = await tx.issue.findFirst({ where: { id: input.epicId, projectId, type: 'EPIC' } });
      if (!epic || epic.id === id) fail(422, '请选择同项目的 Epic');
    }
    if (input.parentId) {
      const parent = await tx.issue.findFirst({
        where: { id: input.parentId, projectId, type: { in: ['STORY', 'TASK', 'BUG'] } },
      });
      if (!parent || parent.id === id) fail(422, '父事项必须是同项目的 Story、Task 或 Bug');
    }
    if (input.sprintId) {
      const s = await tx.sprint.findFirst({ where: { id: input.sprintId, projectId } });
      if (!s || s.status === 'COMPLETED') fail(422, '不能加入已完成或其他项目的 Sprint');
    }
    if (input.assigneeId) {
      const member = await tx.workspaceMember.findFirst({
        where: { actorId: input.assigneeId, workspaceId: c.workspaceId, actor: { active: true } },
      });
      const pm = await tx.projectMember.findUnique({
        where: { projectId_actorId: { projectId, actorId: input.assigneeId } },
      });
      if (!member || (member.role !== 'ADMIN' && !pm)) fail(422, '负责人无此项目访问权限');
    }
    if (input.labelIds) {
      const n = await tx.label.count({ where: { id: { in: input.labelIds }, projectId } });
      if (n !== new Set(input.labelIds).size) fail(422, '标签不属于此项目');
    }
    if (
      id &&
      (input.type === 'EPIC' || input.type === 'SUBTASK') &&
      (await tx.issue.count({ where: { parentId: id } }))
    )
      fail(422, '请先处理子任务，再修改事项类型');
    if (id && input.type !== 'EPIC' && (await tx.issue.count({ where: { epicId: id } })))
      fail(422, 'Epic 仍有关联事项，不能直接转换类型');
  }
  async create(c: ActorContext, projectId: string, input: CreateIssueDto, key?: string) {
    await this.access.project(c, projectId, 'WRITE');
    return this.commands.run(c, `create:${projectId}`, key, input, async (tx) => {
      await this.validate(tx, c, projectId, input);
      const status = input.statusId
        ? { id: input.statusId }
        : await tx.status.findFirst({ where: { projectId }, orderBy: { sortOrder: 'asc' } });
      if (!status) fail(422, '项目没有可用状态');
      const p = await tx.project.update({
        where: { id: projectId },
        data: { issueCounter: { increment: 1 } },
      });
      const { labelIds, ...fields } = input;
      const i = await tx.issue.create({
        data: {
          ...fields,
          title: input.title.trim(),
          projectId,
          number: p.issueCounter,
          statusId: status.id,
          reporterId: c.actorId,
          boardOrder: p.issueCounter * 1000,
          backlogOrder: p.issueCounter * 1000,
        },
      });
      if (labelIds?.length)
        await tx.issueLabel.createMany({
          data: [...new Set(labelIds)].map((labelId) => ({ projectId, issueId: i.id, labelId })),
        });
      await tx.descriptionRevision.create({
        data: { issueId: i.id, actorId: c.actorId, version: 1, markdown: i.description },
      });
      await this.notifications.sync(tx, c, i.id, projectId, '', i.description, 1);
      await this.activity.append(tx, c, projectId, i.id, 'CREATED', { title: i.title, type: i.type }, 1);
      return this.repo.get(tx, i.id);
    });
  }
  async update(c: ActorContext, id: string, input: UpdateIssueDto, key?: string) {
    const original = await this.access.issue(c, id, true);
    return this.commands.run(c, `update:${id}`, key, input, async (tx) => {
      const before = await tx.issue.findUniqueOrThrow({ where: { id } });
      if (before.version !== input.version) conflict();
      const { version, labelIds, ...fields } = input;
      // Completed sprint membership may remain unchanged; changing it must use lifecycle rules.
      const merged = { ...before, ...fields };
      await this.validate(
        tx,
        c,
        original.projectId,
        { ...merged, sprintId: fields.sprintId === undefined ? null : fields.sprintId },
        id,
      );
      if (fields.title) fields.title = fields.title.trim();
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      for (const [field, value] of Object.entries(fields))
        if (value !== (before as unknown as Record<string, unknown>)[field])
          changes[field] = { before: (before as unknown as Record<string, unknown>)[field], after: value };
      if (labelIds) {
        const old = (await tx.issueLabel.findMany({ where: { issueId: id } })).map((l) => l.labelId).sort();
        if (JSON.stringify(old) !== JSON.stringify([...new Set(labelIds)].sort()))
          changes.labels = { before: old, after: labelIds };
      }
      if (!Object.keys(changes).length) return this.repo.get(tx, id);
      const result = await tx.issue.updateMany({
        where: { id, version },
        data: { ...fields, version: { increment: 1 } },
      });
      if (!result.count) conflict();
      if (labelIds) {
        await tx.issueLabel.deleteMany({ where: { issueId: id } });
        await tx.issueLabel.createMany({
          data: [...new Set(labelIds)].map((labelId) => ({
            issueId: id,
            projectId: before.projectId,
            labelId,
          })),
        });
      }
      if (changes.description) {
        await this.notifications.sync(
          tx,
          c,
          id,
          before.projectId,
          before.description,
          fields.description!,
          version + 1,
        );
        const rev = await tx.descriptionRevision.create({
          data: { issueId: id, actorId: c.actorId, version: version + 1, markdown: fields.description! },
        });
        changes.description = { before: '上一版本', after: rev.id };
      }
      if (changes.sprintId) {
        for (const child of await tx.issue.findMany({ where: { parentId: id } })) {
          await this.activity.append(
            tx,
            c,
            before.projectId,
            child.id,
            'SPRINT_INHERITED',
            changes.sprintId as Prisma.InputJsonValue,
            child.version,
          );
        }
      }
      await this.activity.append(
        tx,
        c,
        before.projectId,
        id,
        'UPDATED',
        changes as Prisma.InputJsonValue,
        version + 1,
      );
      return this.repo.get(tx, id);
    });
  }
  async get(c: ActorContext, id: string) {
    await this.access.issue(c, id);
    return this.repo.get(this.db.client, id);
  }
  async byKey(c: ActorContext, key: string) {
    const match = /^([A-Z][A-Z0-9]+)-(\d+)$/.exec(key);
    if (!match) fail(404, '事项不存在');
    const issue = await this.db.client.issue.findFirst({
      where: { project: { key: match[1] }, number: Number(match[2]) },
    });
    if (!issue) fail(404, '事项不存在');
    return this.get(c, issue.id);
  }
  async list(c: ActorContext, projectId: string, query: Record<string, string> = {}) {
    await this.access.project(c, projectId);
    const where: Prisma.IssueWhereInput = { projectId };
    if (query.search) {
      const q = query.search.slice(0, 200);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        ...(/-\d+$/.test(q) ? [{ number: Number(q.split('-').pop()) }] : []),
      ];
    }
    if (query.statusId) where.statusId = { in: query.statusId.split(',') };
    for (const field of ['assigneeId', 'sprintId', 'epicId'] as const)
      if (query[field]) where[field] = query[field] === 'none' ? null : { in: query[field].split(',') };
    if (query.type) where.type = { in: query.type.split(',') as Prisma.EnumIssueTypeFilter['in'] };
    if (query.priority) where.priority = { in: query.priority.split(',') as Prisma.EnumPriorityFilter['in'] };
    const take = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const skip = Math.max(0, Number(query.offset) || 0);
    const [items, total] = await Promise.all([
      this.db.client.issue.findMany({
        where,
        include: issueInclude,
        orderBy: [{ number: 'desc' }],
        take,
        skip,
      }),
      this.db.client.issue.count({ where }),
    ]);
    return { items: items.map(mapIssue), total };
  }
  async activities(c: ActorContext, id: string, cursor?: string) {
    await this.access.issue(c, id);
    const items = await this.db.client.activity.findMany({
      where: { issueId: id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
  }
  async revisions(c: ActorContext, id: string) {
    await this.access.issue(c, id);
    return this.db.client.descriptionRevision.findMany({
      where: { issueId: id },
      select: { id: true, version: true, createdAt: true, actor: { select: { name: true } } },
      orderBy: { version: 'desc' },
      take: 100,
    });
  }
  async revision(c: ActorContext, id: string, revisionId: string) {
    await this.access.issue(c, id);
    const r = await this.db.client.descriptionRevision.findFirst({ where: { id: revisionId, issueId: id } });
    if (!r) fail(404, '版本不存在');
    return r;
  }
  async comments(c: ActorContext, id: string) {
    await this.access.issue(c, id);
    return this.db.client.comment.findMany({
      where: { issueId: id },
      include: { actor: { select: { id: true, name: true, color: true, avatarKey: true, kind: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }
  async comment(
    c: ActorContext,
    id: string,
    input: CommentDto,
    commentId?: string,
    remove = false,
    key?: string,
  ) {
    const issue = await this.access.issue(c, id, true);
    return this.commands.run(c, `comment:${id}`, key, input, async (tx) => {
      if (!remove && !input.content.trim()) fail(422, '评论不能为空');
      let comment;
      let previousContent = '';
      if (commentId) {
        const old = await tx.comment.findFirst({ where: { id: commentId, issueId: id } });
        if (!old) fail(404, '评论不存在');
        if (old.actorId !== c.actorId) fail(403, '只能编辑自己的评论');
        if (old.version !== input.version) conflict();
        if (old.deletedAt) fail(422, '评论已删除');
        previousContent = old.content;
        await tx.commentRevision.create({ data: { commentId, version: old.version, content: old.content } });
        comment = await tx.comment.update({
          where: { id: commentId },
          data: {
            content: remove ? '' : input.content,
            deletedAt: remove ? new Date() : null,
            version: { increment: 1 },
          },
        });
      } else
        comment = await tx.comment.create({
          data: { issueId: id, actorId: c.actorId, content: input.content },
        });
      await this.notifications.sync(
        tx,
        c,
        id,
        issue.projectId,
        previousContent,
        comment.content,
        comment.version,
        comment.id,
      );
      await this.activity.append(
        tx,
        c,
        issue.projectId,
        id,
        remove ? 'COMMENT_DELETED' : commentId ? 'COMMENT_EDITED' : 'COMMENT_ADDED',
        { commentId: comment.id },
      );
      return comment;
    });
  }
}

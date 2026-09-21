import Decimal from 'decimal.js';
import { IssueRepository } from '../issue/issue.repository.js';
import type { PlanningMoveDto } from './sprint.dto.js';
import { Injectable, Inject } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { CommandService } from '../../common/command.service.js';
import { AccessService } from '../auth/access.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { IssueService } from '../issue/issue.service.js';
import { conflict, fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { CreateSprintDto, SprintCommandDto, SprintIssueDto } from './sprint.dto.js';
@Injectable()
export class SprintService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommandService) private commands: CommandService,
    @Inject(AccessService) private access: AccessService,
    @Inject(ActivityRepository) private activity: ActivityRepository,
    @Inject(IssueService) private issues: IssueService,
  ) {}
  async list(c: ActorContext, id: string) {
    await this.access.project(c, id);
    return this.db.client.sprint.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } });
  }
  async create(c: ActorContext, input: CreateSprintDto, key?: string) {
    await this.access.project(c, input.projectId, 'WRITE');
    if (input.endAt && input.startAt && new Date(input.endAt) <= new Date(input.startAt))
      fail(422, '结束日期必须晚于开始日期');
    return this.commands.run(c, `sprint:create:${input.projectId}`, key, input, async (tx) => {
      const s = await tx.sprint.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          goal: input.goal,
          startAt: input.startAt ? new Date(input.startAt) : undefined,
          endAt: input.endAt ? new Date(input.endAt) : undefined,
        },
      });
      await this.activity.append(tx, c, input.projectId, null, 'SPRINT_CREATED', {
        sprintId: s.id,
        name: s.name,
      });
      return s;
    });
  }
  async lifecycle(
    c: ActorContext,
    id: string,
    action: 'start' | 'complete' | 'delete',
    input: SprintCommandDto,
    key?: string,
  ) {
    const s = await this.db.client.sprint.findUnique({ where: { id } });
    if (!s) fail(404, 'Sprint 不存在');
    await this.access.project(c, s.projectId, 'WRITE');
    return this.commands.run(c, `sprint:${action}:${id}`, key, input, async (tx) => {
      const current = await tx.sprint.findUniqueOrThrow({ where: { id } });
      if (current.version !== input.version) conflict();
      if (action === 'start') {
        if (current.status !== 'PLANNED') fail(422, '只能启动计划中的 Sprint');
        if (await tx.sprint.findFirst({ where: { projectId: s.projectId, status: 'ACTIVE' } }))
          fail(422, '项目已有活跃 Sprint，请先完成它');
        const updated = await tx.sprint.update({
          where: { id },
          data: { status: 'ACTIVE', startAt: current.startAt ?? new Date(), version: { increment: 1 } },
        });
        await this.activity.append(tx, c, s.projectId, null, 'SPRINT_STARTED', {
          sprintId: id,
          name: s.name,
        });
        return updated;
      }
      if (action === 'delete' && current.status !== 'PLANNED') fail(422, '只能删除计划中的 Sprint');
      if (action === 'complete' && current.status !== 'ACTIVE') fail(422, '只能完成活跃 Sprint');
      const destination = action === 'complete' ? (input.destinationSprintId ?? null) : null;
      if (destination) {
        const target = await tx.sprint.findFirst({
          where: { id: destination, projectId: s.projectId, status: 'PLANNED' },
        });
        if (!target || destination === id) fail(422, '请选择同项目的下一计划 Sprint');
      }
      const issues = await tx.issue.findMany({
        where: {
          sprintId: id,
          ...(action === 'complete' ? { status: { category: { not: 'DONE' as const } } } : {}),
        },
      });
      for (const issue of issues) {
        await tx.issue.update({
          where: { id: issue.id },
          data: { sprintId: destination, version: { increment: 1 } },
        });
        await this.activity.append(
          tx,
          c,
          s.projectId,
          issue.id,
          'UPDATED',
          { sprintId: { before: id, after: destination } },
          issue.version + 1,
        );
        for (const child of await tx.issue.findMany({ where: { parentId: issue.id } }))
          await this.activity.append(
            tx,
            c,
            s.projectId,
            child.id,
            'SPRINT_INHERITED',
            { before: id, after: destination },
            child.version,
          );
      }
      await this.activity.append(
        tx,
        c,
        s.projectId,
        null,
        action === 'complete' ? 'SPRINT_COMPLETED' : 'SPRINT_DELETED',
        { sprintId: id, name: s.name, moved: issues.length, destinationSprintId: destination },
      );
      return action === 'delete'
        ? await tx.sprint.delete({ where: { id } })
        : await tx.sprint.update({
            where: { id },
            data: { status: 'COMPLETED', endAt: new Date(), version: { increment: 1 } },
          });
    });
  }
  async unassign(c: ActorContext, sprintId: string, issueId: string, version: number) {
    const issue = await this.access.issue(c, issueId, true);
    if (issue.sprintId !== sprintId) fail(422, '事项不属于此 Sprint');
    return this.assign(c, null, { issueId, version });
  }
  async assign(c: ActorContext, sprintId: string | null, input: SprintIssueDto) {
    return this.issues.update(c, input.issueId, { version: input.version, sprintId });
  }
  async plan(c: ActorContext, projectId: string, input: PlanningMoveDto, key?: string) {
    await this.access.project(c, projectId, 'WRITE');
    return this.commands.run(c, `planning:${projectId}`, key, input, async (tx) => {
      const issue = await tx.issue.findFirst({ where: { id: input.issueId, projectId } });
      if (!issue) fail(404, '事项不存在');
      if (issue.version !== input.version) conflict();
      if (!['STORY', 'TASK', 'BUG'].includes(issue.type)) fail(422, '只有 Story、Task 和 Bug 可以独立规划');
      const sprintId = input.targetSprintId ?? null;
      if (
        sprintId &&
        !(await tx.sprint.findFirst({ where: { id: sprintId, projectId, status: { not: 'COMPLETED' } } }))
      )
        fail(422, '目标 Sprint 无效或已完成');
      const list = await tx.issue.findMany({
        where: { projectId, sprintId, type: { in: ['STORY', 'TASK', 'BUG'] }, id: { not: issue.id } },
        orderBy: [{ backlogOrder: 'asc' }, { id: 'asc' }],
      });
      let index = list.length;
      if (input.nextIssueId) {
        index = list.findIndex((i) => i.id === input.nextIssueId);
        if (index < 0) conflict();
      } else if (input.previousIssueId) {
        const p = list.findIndex((i) => i.id === input.previousIssueId);
        if (p < 0) conflict();
        index = p + 1;
      }
      const lower = list[index - 1]?.backlogOrder;
      const upper = list[index]?.backlogOrder;
      let rank =
        lower && upper
          ? new Decimal(lower.toString()).plus(upper.toString()).div(2)
          : lower
            ? new Decimal(lower.toString()).plus(1000)
            : upper
              ? new Decimal(upper.toString()).minus(1000)
              : new Decimal(1000);
      if (
        lower &&
        upper &&
        new Decimal(upper.toString()).minus(lower.toString()).lt('0.00000000000000000001')
      ) {
        let radius = 16,
          start = 0,
          end = 0,
          base = new Decimal(0),
          step = new Decimal(0);
        do {
          start = Math.max(0, index - radius);
          end = Math.min(list.length, index + radius);
          base = start ? new Decimal(list[start - 1].backlogOrder.toString()) : new Decimal(0);
          const bound =
            end < list.length
              ? new Decimal(list[end].backlogOrder.toString())
              : base.plus((end - start + 2) * 1000);
          step = bound.minus(base).div(end - start + 2);
          radius *= 2;
        } while (step.lt('0.00000000000000000001') && (start > 0 || end < list.length));
        for (let j = start; j < end; j++) {
          const r = base.plus(step.mul(j - start + 1));
          await tx.issue.update({
            where: { id: list[j].id },
            data: { backlogOrder: r.toFixed(30), version: { increment: 1 } },
          });
        }
        rank = base.plus(step.mul(index - start + 0.5));
      }
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: { sprintId, backlogOrder: rank.toFixed(30), version: { increment: 1 } },
      });
      await this.activity.append(
        tx,
        c,
        projectId,
        issue.id,
        'PLANNED',
        {
          sprintId: { before: issue.sprintId, after: sprintId },
          backlogOrder: { before: issue.backlogOrder.toString(), after: rank.toString() },
        },
        updated.version,
      );
      if (issue.sprintId !== sprintId)
        for (const child of await tx.issue.findMany({ where: { parentId: issue.id } }))
          await this.activity.append(
            tx,
            c,
            projectId,
            child.id,
            'SPRINT_INHERITED',
            { sprintId: { before: issue.sprintId, after: sprintId } },
            child.version,
          );
      return new IssueRepository().get(tx, issue.id);
    });
  }
}

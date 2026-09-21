import { Injectable, Inject } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Db } from '../../common/db.js';
import { CommandService } from '../../common/command.service.js';
import { AccessService } from '../auth/access.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { IssueRepository, issueInclude, mapIssue } from '../issue/issue.repository.js';
import { conflict, fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { MoveIssueDto } from './board.dto.js';
Decimal.set({ precision: 65 });
@Injectable()
export class BoardService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommandService) private commands: CommandService,
    @Inject(AccessService) private access: AccessService,
    @Inject(ActivityRepository) private activity: ActivityRepository,
    @Inject(IssueRepository) private issues: IssueRepository,
  ) {}
  async get(c: ActorContext, id: string) {
    const project = await this.access.project(c, id);
    const wm = await this.access.workspace(c);
    const role = wm.role === 'ADMIN' ? 'ADMIN' : project.members[0]?.role;
    const [statuses, columns, issues, sprints, members, labels] = await Promise.all([
      this.db.client.status.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } }),
      this.db.client.boardColumn.findMany({
        where: { projectId: id },
        include: { statuses: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.db.client.issue.findMany({
        where: { projectId: id },
        include: issueInclude,
        orderBy: [{ boardOrder: 'asc' }, { id: 'asc' }],
        take: 5000,
      }),
      this.db.client.sprint.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
      this.db.client.actor.findMany({
        where: {
          active: true,
          OR: [
            { projects: { some: { projectId: id } } },
            { memberships: { some: { workspaceId: c.workspaceId, role: 'ADMIN' } } },
          ],
        },
        select: { id: true, name: true, color: true, kind: true },
      }),
      this.db.client.label.findMany({ where: { projectId: id } }),
    ]);
    return {
      permissions: { canWrite: role !== 'VIEWER', canAdmin: role === 'ADMIN' },
      project,
      statuses,
      columns,
      issues: issues.map(mapIssue),
      sprints,
      members,
      labels,
    };
  }
  async move(c: ActorContext, projectId: string, input: MoveIssueDto, key?: string) {
    await this.access.project(c, projectId, 'WRITE');
    return this.commands.run(c, `board:${projectId}`, key, input, async (tx) => {
      const issue = await tx.issue.findFirst({ where: { id: input.issueId, projectId } });
      if (!issue) fail(404, '事项不存在');
      if (issue.version !== input.version) conflict();
      if (issue.type === 'EPIC' || issue.type === 'SUBTASK') fail(422, 'Board 只展示 Story、Task 和 Bug');
      const mapping = await tx.boardColumnStatus.findFirst({
        where: { projectId, columnId: input.targetColumnId, statusId: input.targetStatusId },
      });
      if (!mapping) fail(422, '落点状态不属于目标列');
      const list = await tx.issue.findMany({
        where: {
          projectId,
          statusId: input.targetStatusId,
          sprintId: issue.sprintId,
          id: { not: issue.id },
          type: { in: ['STORY', 'TASK', 'BUG'] },
        },
        orderBy: [{ boardOrder: 'asc' }, { id: 'asc' }],
      });
      let index = list.length;
      if (input.nextIssueId) {
        index = list.findIndex((i) => i.id === input.nextIssueId);
        if (index < 0) fail(409, '目标位置已变化，请重试');
      } else if (input.previousIssueId) {
        const p = list.findIndex((i) => i.id === input.previousIssueId);
        if (p < 0) fail(409, '目标位置已变化，请重试');
        index = p + 1;
      }
      if (input.previousIssueId && input.nextIssueId) {
        const p = list.findIndex((i) => i.id === input.previousIssueId);
        if (p < 0 || p >= index) fail(409, '排序位置已变化');
      }
      const prev = list[index - 1];
      const next = list[index];
      const rank = () =>
        prev && next
          ? new Decimal(prev.boardOrder.toString()).plus(next.boardOrder.toString()).div(2)
          : prev
            ? new Decimal(prev.boardOrder.toString()).plus(1000)
            : next
              ? new Decimal(next.boardOrder.toString()).minus(1000)
              : new Decimal(1000);
      let order = rank();
      if (
        prev &&
        next &&
        new Decimal(next.boardOrder.toString()).minus(prev.boardOrder.toString()).lt('0.00000000000000000001')
      ) {
        // Expand a local window until evenly spaced decimal ranks fit between its external neighbors.
        let radius = 16;
        let start = 0,
          end = 0,
          step = new Decimal(0),
          base = new Decimal(0);
        do {
          start = Math.max(0, index - radius);
          end = Math.min(list.length, index + radius);
          base = start ? new Decimal(list[start - 1].boardOrder.toString()) : new Decimal(0);
          const upper =
            end < list.length
              ? new Decimal(list[end].boardOrder.toString())
              : base.plus((end - start + 2) * 1000);
          step = upper.minus(base).div(end - start + 2);
          radius *= 2;
        } while (step.lt('0.00000000000000000001') && (start > 0 || end < list.length));
        for (let j = start; j < end; j++) {
          const v = base.plus(step.mul(j - start + 1));
          await tx.issue.update({
            where: { id: list[j].id },
            data: { boardOrder: v.toFixed(30), version: { increment: 1 } },
          });
          list[j].boardOrder = v as unknown as (typeof list)[number]['boardOrder'];
        }
        order = rank();
      }
      const moved = await tx.issue.update({
        where: { id: issue.id },
        data: { statusId: input.targetStatusId, boardOrder: order.toFixed(30), version: { increment: 1 } },
      });
      await this.activity.append(
        tx,
        c,
        projectId,
        issue.id,
        'MOVED',
        {
          statusId: { before: issue.statusId, after: input.targetStatusId },
          boardOrder: { before: issue.boardOrder.toString(), after: moved.boardOrder.toString() },
        },
        moved.version,
      );
      return this.issues.get(tx, issue.id);
    });
  }
}

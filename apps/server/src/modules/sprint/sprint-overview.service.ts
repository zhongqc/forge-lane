import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Db } from '../../common/db.js';
import { fail } from '../../common/errors.js';
import { AccessService } from '../auth/access.service.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type {
  ActorContext,
  SprintOverviewIssue,
  SprintMemberPoints,
} from '../../../../../packages/shared/src/contracts.js';
interface Snapshot {
  schemaVersion: 1;
  issues: SprintOverviewIssue[];
  actors: { id: string; name: string }[];
}
export async function captureSprint(
  tx: Prisma.TransactionClient,
  sprintId: string,
  projectId: string,
  workspaceId: string,
): Promise<Snapshot> {
  const issues = await tx.issue.findMany({
    where: { sprintId, projectId, type: { in: ['STORY', 'TASK', 'BUG'] } },
    include: { status: true, assignee: true, project: true },
    orderBy: { number: 'asc' },
  });
  const actors = await tx.actor.findMany({
    where: {
      active: true,
      memberships: { some: { workspaceId } },
      OR: [{ memberships: { some: { workspaceId, role: 'ADMIN' } } }, { projects: { some: { projectId } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return {
    schemaVersion: 1,
    actors,
    issues: issues.map((i) => ({
      id: i.id,
      key: `${i.project.key}-${i.number}`,
      title: i.title,
      type: i.type,
      statusName: i.status.name,
      done: i.status.category === 'DONE',
      assigneeId: i.assigneeId,
      assigneeName: i.assignee?.name ?? '未分配',
      estimate: i.estimate,
    })),
  };
}
export function memberPoints(snapshot: Snapshot): SprintMemberPoints[] {
  const rows = new Map<string | null, SprintMemberPoints>();
  const row = (id: string | null, name: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { actorId: id, name, issues: 0, unestimated: 0, total: 0, completed: 0, remaining: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const actor of snapshot.actors) row(actor.id, actor.name);
  for (const issue of snapshot.issues) {
    const r = row(issue.assigneeId, issue.assigneeName);
    r.issues++;
    if (issue.estimate === null) r.unestimated++;
    else {
      r.total = new Decimal(r.total).plus(issue.estimate).toNumber();
      if (issue.done) r.completed = new Decimal(r.completed).plus(issue.estimate).toNumber();
    }
  }
  for (const r of rows.values()) r.remaining = new Decimal(r.total).minus(r.completed).toNumber();
  return [...rows.values()].sort((a, b) =>
    a.actorId === null ? 1 : b.actorId === null ? -1 : b.total - a.total || a.name.localeCompare(b.name),
  );
}
@Injectable()
export class SprintOverviewService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AccessService) private access: AccessService,
  ) {}
  async get(c: ActorContext, id: string) {
    const sprint = await this.db.client.sprint.findUnique({ where: { id }, include: { snapshot: true } });
    if (!sprint) fail(404, 'Sprint 不存在');
    await this.access.project(c, sprint.projectId);
    const { snapshot, ...meta } = sprint;
    const payload = snapshot
      ? (snapshot.payload as unknown as Snapshot)
      : await captureSprint(this.db.client, id, sprint.projectId, c.workspaceId);
    return {
      sprint: meta,
      snapshotAt: snapshot?.capturedAt ?? null,
      completeSnapshot: sprint.status !== 'COMPLETED' || !!snapshot,
      issues: payload.issues,
      members: memberPoints(payload),
    };
  }
}

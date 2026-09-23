import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../packages/db/src/client.js';
const actorSelect = { id: true, name: true, color: true, avatarKey: true, kind: true } as const;
export const issueInclude = {
  project: { select: { key: true } },
  status: true,
  assignee: { select: actorSelect },
  reporter: { select: actorSelect },
  epic: { select: { id: true, title: true, number: true, project: { select: { key: true } } } },
  parent: {
    select: {
      id: true,
      title: true,
      number: true,
      sprintId: true,
      epicId: true,
      project: { select: { key: true } },
    },
  },
  labels: { include: { label: true } },
} as const;
export type IssueRow = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;
export function mapIssue(i: IssueRow) {
  return {
    ...i,
    key: `${i.project.key}-${i.number}`,
    boardOrder: i.boardOrder.toString(),
    backlogOrder: i.backlogOrder.toString(),
    effectiveSprintId: i.type === 'SUBTASK' ? (i.parent?.sprintId ?? null) : i.sprintId,
    effectiveEpicId: i.type === 'SUBTASK' ? (i.parent?.epicId ?? null) : i.epicId,
    epic: i.epic ? { ...i.epic, key: `${i.epic.project.key}-${i.epic.number}` } : null,
    parent: i.parent ? { ...i.parent, key: `${i.parent.project.key}-${i.parent.number}` } : null,
  };
}
@Injectable()
export class IssueRepository {
  async get(tx: Prisma.TransactionClient, id: string) {
    const i = await tx.issue.findUniqueOrThrow({
      where: { id },
      include: {
        ...issueInclude,
        children: { include: issueInclude, orderBy: { createdAt: 'asc' } },
        epicChildren: { include: issueInclude, orderBy: { number: 'asc' } },
      },
    });
    return { ...mapIssue(i), children: i.children.map(mapIssue), epicChildren: i.epicChildren.map(mapIssue) };
  }
}

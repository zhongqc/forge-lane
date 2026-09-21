import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
@Injectable()
export class ActivityRepository {
  async append(
    tx: Prisma.TransactionClient,
    c: ActorContext,
    projectId: string,
    issueId: string | null,
    type: string,
    payload: Prisma.InputJsonValue,
    version?: number,
  ) {
    const snapshot = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    for (const [field, change] of Object.entries(snapshot)) {
      if (!change || typeof change !== 'object' || !('before' in change) || !('after' in change)) continue;
      const pair = change as { before: unknown; after: unknown; beforeLabel?: string; afterLabel?: string };
      const label = async (value: unknown) => {
        if (value === null) return '无';
        if (typeof value !== 'string') return undefined;
        if (field === 'statusId')
          return (await tx.status.findFirst({ where: { id: value, projectId } }))?.name;
        if (field === 'assigneeId') return (await tx.actor.findUnique({ where: { id: value } }))?.name;
        if (field === 'sprintId')
          return (await tx.sprint.findFirst({ where: { id: value, projectId } }))?.name;
        if (field === 'epicId') return (await tx.issue.findFirst({ where: { id: value, projectId } }))?.title;
        return undefined;
      };
      const before = await label(pair.before);
      const after = await label(pair.after);
      if (before !== undefined) pair.beforeLabel = before;
      if (after !== undefined) pair.afterLabel = after;
    }
    return tx.activity.create({
      data: {
        workspaceId: c.workspaceId,
        projectId,
        issueId,
        actorId: c.actorId,
        actorNameSnapshot: c.actorName,
        source: c.source,
        requestId: c.requestId,
        type,
        payload: snapshot as Prisma.InputJsonValue,
        issueVersion: version,
      },
    });
  }
}

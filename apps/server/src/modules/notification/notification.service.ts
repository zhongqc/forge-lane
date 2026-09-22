import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { AccessService } from '../auth/access.service.js';
import { EmailChannel } from './notification-channel.js';
import { mentionIds } from './mention-parser.js';
import { fail } from '../../common/errors.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';

export function accessibleActor(workspaceId: string, projectId: string): Prisma.ActorWhereInput {
  return {
    active: true,
    memberships: { some: { workspaceId } },
    OR: [{ memberships: { some: { workspaceId, role: 'ADMIN' } } }, { projects: { some: { projectId } } }],
  };
}
@Injectable()
export class NotificationService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AccessService) private access: AccessService,
    @Inject(EmailChannel) private email: EmailChannel,
  ) {}
  async members(c: ActorContext, projectId: string) {
    await this.access.project(c, projectId);
    const actors = await this.db.client.actor.findMany({
      where: accessibleActor(c.workspaceId, projectId),
      select: { id: true, name: true, color: true, user: { select: { email: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return actors.map(({ user, ...actor }) => ({ ...actor, ...(user ? { email: user.email } : {}) }));
  }
  async sync(
    tx: Prisma.TransactionClient,
    c: ActorContext,
    issueId: string,
    projectId: string,
    before: string,
    after: string,
    version: number,
    commentId?: string,
  ) {
    const previous = mentionIds(before),
      current = mentionIds(after);
    const source = commentId ? 'COMMENT' : 'DESCRIPTION',
      sourceId = commentId ?? issueId;
    const removed = [...previous].filter((id) => !current.has(id));
    if (removed.length) {
      await tx.mentionNotification.updateMany({
        where: { source, sourceId, recipientId: { in: removed }, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      await tx.notificationDelivery.updateMany({
        where: {
          notification: { source, sourceId, recipientId: { in: removed } },
          status: { in: ['PENDING', 'SENDING'] },
        },
        data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null },
      });
    }
    const added = [...current].filter((id) => id !== c.actorId && !previous.has(id));
    if (!added.length) return;
    const recipients = await tx.actor.findMany({
      where: {
        ...accessibleActor(c.workspaceId, projectId),
        id: { in: added },
      },
      include: { user: { select: { email: true } } },
    });
    for (const recipient of recipients)
      await tx.mentionNotification.create({
        data: {
          issueId,
          recipientId: recipient.id,
          senderId: c.actorId,
          senderName: c.actorName,
          source,
          sourceId,
          sourceVersion: version,
          commentId,
          deliveries: {
            create: {
              status: this.email.configured() && recipient.user ? 'PENDING' : 'SKIPPED',
              lastError: recipient.user
                ? this.email.configured()
                  ? null
                  : 'EMAIL_NOT_CONFIGURED'
                : 'NO_EMAIL',
            },
          },
        },
      });
  }
  private async visible(c: ActorContext): Promise<Prisma.MentionNotificationWhereInput> {
    if (c.token) fail(403, '此操作必须使用网页登录');
    const member = await this.access.workspace(c);
    return {
      recipientId: c.actorId,
      cancelledAt: null,
      issue: {
        project: {
          workspaceId: c.workspaceId,
          ...(member.role === 'ADMIN' ? {} : { members: { some: { actorId: c.actorId } } }),
        },
      },
    };
  }
  async list(c: ActorContext, cursor?: string) {
    const where = await this.visible(c);
    let position: Prisma.MentionNotificationWhereInput = {};
    if (cursor) {
      if (
        typeof cursor !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)
      )
        fail(400, '无效游标');
      const item = await this.db.client.mentionNotification.findFirst({
        where: { ...where, cancelledAt: undefined, id: cursor },
      });
      if (!item) fail(400, '无效游标');
      position = {
        OR: [{ createdAt: { lt: item.createdAt } }, { createdAt: item.createdAt, id: { lt: item.id } }],
      };
    }
    const [rows, unreadCount] = await Promise.all([
      this.db.client.mentionNotification.findMany({
        where: { AND: [where, position] },
        take: 51,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { issue: { include: { project: true } } },
      }),
      this.db.client.mentionNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: rows.slice(0, 50).map((n) => ({
        id: n.id,
        issueKey: `${n.issue.project.key}-${n.issue.number}`,
        projectKey: n.issue.project.key,
        issueTitle: n.issue.title,
        senderName: n.senderName,
        source: n.source,
        commentId: n.commentId,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
      unreadCount,
    };
  }
  async read(c: ActorContext, id?: string) {
    const where = await this.visible(c);
    if (id && !(await this.db.client.mentionNotification.findFirst({ where: { ...where, id } })))
      fail(404, '通知不存在');
    await this.db.client.mentionNotification.updateMany({
      where: { ...where, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

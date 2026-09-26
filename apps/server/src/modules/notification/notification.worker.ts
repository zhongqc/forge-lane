import { Inject, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db } from '../../common/db.js';
import { EmailChannel } from './notification-channel.js';
import { accessibleActor } from './notification.service.js';
import { mentionIds } from './mention-parser.js';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(EmailChannel) private email: EmailChannel,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && this.email.configured()) {
      this.timer = setInterval(() => {
        void this.tick().catch(() => {});
      }, 5000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  async tick() {
    if (this.active || !this.email.configured()) return;
    this.active = this.run();
    try {
      await this.active;
    } finally {
      this.active = undefined;
    }
  }
  private async run() {
    const now = new Date();
    await this.db.client.notificationDelivery.updateMany({
      where: {
        channel: 'EMAIL',
        status: { in: ['PENDING', 'SENDING'] },
        attempts: { gte: 5 },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { status: 'FAILED', lastError: 'EMAIL_ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null },
    });
    const candidates = await this.db.client.notificationDelivery.findMany({
      where: {
        channel: 'EMAIL',
        attempts: { lt: 5 },
        status: { in: ['PENDING', 'SENDING'] },
        retryAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const candidate of candidates) {
      const leaseToken = randomUUID();
      const claimed = await this.db.client.notificationDelivery.updateMany({
        where: {
          id: candidate.id,
          attempts: { lt: 5 },
          status: { in: ['PENDING', 'SENDING'] },
          retryAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          status: 'SENDING',
          leaseToken,
          leaseUntil: new Date(Date.now() + 120000),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) continue;
      const fence = { id: candidate.id, leaseToken, status: 'SENDING' };
      const currentClaim = await this.db.client.notificationDelivery.findFirst({ where: fence });
      if (!currentClaim) continue;
      const renew = setInterval(() => {
        void this.db.client.notificationDelivery
          .updateMany({ where: fence, data: { leaseUntil: new Date(Date.now() + 120000) } })
          .catch(() => {});
      }, 30000);
      renew.unref();
      try {
        const event = await this.db.client.mentionNotification.findUniqueOrThrow({
          where: { id: candidate.notificationId },
          include: { issue: { include: { project: true } }, recipient: { include: { user: true } } },
        });
        const allowed = await this.db.client.actor.findFirst({
          where: {
            id: event.recipientId,
            ...accessibleActor(event.issue.project.workspaceId, event.issue.projectId),
          },
        });
        const comment = event.commentId
          ? await this.db.client.comment.findUnique({ where: { id: event.commentId } })
          : null;
        const content =
          event.source === 'COMMENT'
            ? comment && !comment.deletedAt
              ? comment.content
              : ''
            : event.issue.description;
        if (event.cancelledAt || !allowed || !mentionIds(content).has(event.recipientId)) {
          await this.db.client.notificationDelivery.updateMany({
            where: fence,
            data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null },
          });
          continue;
        }
        if (!event.recipient.user) {
          await this.db.client.notificationDelivery.updateMany({
            where: fence,
            data: { status: 'SKIPPED', lastError: 'NO_EMAIL', leaseToken: null, leaseUntil: null },
          });
          continue;
        }
        // Last fence catches source cancellation while this job was preparing its message.
        if (
          !(await this.db.client.notificationDelivery.findFirst({
            where: { ...fence, notification: { cancelledAt: null } },
          }))
        )
          continue;
        const issueKey = `${event.issue.project.key}-${event.issue.number}`;
        const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/?$/, '/');
        const url = new URL(`issues/${issueKey}`, base);
        if (event.commentId) url.hash = `comment-${event.commentId}`;
        await this.email.send({
          id: event.id,
          to: event.recipient.user.email,
          senderName: event.senderName,
          issueKey,
          issueTitle: event.issue.title,
          url: url.toString(),
        });
        await this.db.client.notificationDelivery.updateMany({
          where: fence,
          data: { status: 'SENT', sentAt: new Date(), lastError: null, leaseToken: null, leaseUntil: null },
        });
      } catch {
        await this.db.client.notificationDelivery.updateMany({
          where: fence,
          data: {
            status: currentClaim.attempts >= 5 ? 'FAILED' : 'PENDING',
            lastError: 'EMAIL_DELIVERY_FAILED',
            leaseToken: null,
            leaseUntil: null,
            retryAt: new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(currentClaim.attempts - 1, 7)),
            ),
          },
        });
      } finally {
        clearInterval(renew);
      }
    }
  }
}

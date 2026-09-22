import { Injectable, Inject, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db } from '../../common/db.js';
import { GitHubClient, GitHubError } from './github.client.js';
import { GitHubProcessor } from './github.processor.js';
interface Payload {
  action?: string;
  repository?: { id?: number };
  installation?: { id?: number };
  repositories_removed?: { id: number }[];
  ref?: string;
  commits?: { id: string; message: string; timestamp: string; author: { name: string; username?: string } }[];
}
@Injectable()
export class GitHubWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(GitHubClient) private client: GitHubClient,
    @Inject(GitHubProcessor) private processor: GitHubProcessor,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.tick().catch(() => {});
      }, 3000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running || !this.client.configured()) return;
    this.running = true;
    try {
      const deliveries = await this.db.client.gitHubDelivery.findMany({
        where: { processedAt: null, OR: [{ retryAt: null }, { retryAt: { lte: new Date() } }] },
        orderBy: { receivedAt: 'asc' },
        take: 20,
      });
      for (const delivery of deliveries) {
        try {
          const payload = delivery.payload as unknown as Payload;
          // Push payload is signed and durable; record feature-branch commits too, not only default branch history.
          if (delivery.event === 'push' && payload.repository?.id && payload.installation?.id) {
            const repos = await this.db.client.gitHubRepository.findMany({
              where: {
                githubId: String(payload.repository.id),
                installationId: String(payload.installation.id),
                enabled: true,
              },
            });
            const commits = (payload.commits ?? [])
              .filter(
                (c) =>
                  c &&
                  typeof c.id === 'string' &&
                  typeof c.message === 'string' &&
                  c.author &&
                  Number.isFinite(Date.parse(c.timestamp)),
              )
              .map((c) => ({
                sha: c.id,
                html_url: '',
                author: c.author.username ? { login: c.author.username } : null,
                commit: { message: c.message, author: { name: c.author.name, date: c.timestamp } },
              }));
            for (const repo of repos)
              await this.processor.apply(repo.id, [], commits, {
                branch: payload.ref,
                deliveryId: delivery.id,
              });
          }
          await this.db.client.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`github-delivery:${delivery.id}`},0))`;
            const current = await tx.gitHubDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
            if (current.processedAt) return;
            if (payload.installation?.id) {
              const installationId = String(payload.installation.id);
              if (
                delivery.event === 'installation' &&
                ['deleted', 'suspend'].includes(payload.action ?? '')
              ) {
                await tx.gitHubRepository.updateMany({
                  where: { installationId },
                  data: {
                    enabled: false,
                    requestedAt: null,
                    leaseToken: null,
                    leaseUntil: null,
                    lastError: 'GitHub App 已卸载或暂停，请恢复授权后重新启用',
                  },
                });
              } else if (
                delivery.event === 'installation_repositories' &&
                payload.repositories_removed?.length
              ) {
                await tx.gitHubRepository.updateMany({
                  where: {
                    installationId,
                    githubId: { in: payload.repositories_removed.map((r) => String(r.id)) },
                  },
                  data: {
                    enabled: false,
                    requestedAt: null,
                    leaseToken: null,
                    leaseUntil: null,
                    lastError: 'GitHub App 已失去仓库访问权限',
                  },
                });
              } else if (payload.repository?.id) {
                await tx.gitHubRepository.updateMany({
                  where: { githubId: String(payload.repository.id), installationId, enabled: true },
                  data: { requestedAt: new Date() },
                });
              }
            }
            await tx.gitHubDelivery.update({
              where: { id: delivery.id },
              data: { processedAt: new Date(), error: null },
            });
          });
        } catch {
          await this.db.client.gitHubDelivery.update({
            where: { id: delivery.id },
            data: {
              attempts: { increment: 1 },
              error: '事件处理失败，将自动重试',
              retryAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(delivery.attempts, 7))),
            },
          });
        }
      }
      const repos = await this.db.client.gitHubRepository.findMany({
        where: {
          enabled: true,
          requestedAt: { not: null },
          AND: [
            { OR: [{ retryAt: null }, { retryAt: { lte: new Date() } }] },
            { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
          ],
        },
        take: 5,
        orderBy: { requestedAt: 'asc' },
      });
      for (const repo of repos) {
        const startedAt = new Date(),
          leaseToken = randomUUID();
        const claimed = await this.db.client.gitHubRepository.updateMany({
          where: {
            id: repo.id,
            enabled: true,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: startedAt } }],
          },
          data: { leaseToken, leaseUntil: new Date(Date.now() + 120000) },
        });
        if (!claimed.count) continue;
        // Renew lease while paginating large repositories; token fences stale workers.
        const renew = setInterval(() => {
          void this.db.client.gitHubRepository
            .updateMany({
              where: { id: repo.id, leaseToken },
              data: { leaseUntil: new Date(Date.now() + 120000) },
            })
            .catch(() => {});
        }, 30000);
        renew.unref();
        try {
          const snapshot = await this.client.snapshot(
            repo.fullName,
            repo.installationId,
            repo.lastSyncedAt,
            repo.githubId,
          );
          await this.processor.apply(repo.id, snapshot.pulls, snapshot.commits, {
            leaseToken,
            startedAt,
            fullName: snapshot.fullName,
          });
        } catch (error) {
          await this.db.client.gitHubRepository.updateMany({
            where: { id: repo.id, leaseToken },
            data: {
              leaseToken: null,
              leaseUntil: null,
              attempts: { increment: 1 },
              lastError: error instanceof GitHubError ? error.message : '同步失败，将自动重试',
              retryAt:
                error instanceof GitHubError
                  ? error.retryAt
                  : new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(repo.attempts, 7))),
            },
          });
        } finally {
          clearInterval(renew);
        }
      }
      const pending = await this.db.client.gitHubRepository.findMany({
        where: { enabled: true, requestedAt: null, lastError: null, pendingAutomations: { not: [] } },
        take: 100,
      });
      for (const repo of pending) await this.processor.apply(repo.id, [], []);
    } finally {
      this.running = false;
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { CommandService } from '../../common/command.service.js';
import { AccessService } from '../auth/access.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { conflict, fail } from '../../common/errors.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type { ClaimDto, RenewDto, FinishDto } from './execution.dto.js';
@Injectable()
export class ExecutionService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommandService) private commands: CommandService,
    @Inject(AccessService) private access: AccessService,
    @Inject(ActivityRepository) private activity: ActivityRepository,
  ) {}
  private async writable(c: ActorContext, projectId: string) {
    if (!c.token) fail(403, '执行写入需要 Bearer 令牌');
    await this.access.project(c, projectId, 'WRITE');
    const token = await this.db.client.apiToken.findUnique({
      where: { id: c.token.id },
      include: { actor: true },
    });
    if (!token || token.revokedAt || token.expiresAt <= new Date() || !token.actor.active)
      fail(401, '令牌已失效', 'UNAUTHENTICATED');
  }
  private expire(tx: Prisma.TransactionClient, where: Prisma.IssueExecutionWhereInput) {
    return tx.issueExecution.updateMany({
      where: { ...where, status: 'RUNNING', leaseExpiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED', version: { increment: 1 }, finishedAt: new Date() },
    });
  }
  async claim(c: ActorContext, issueId: string, input: ClaimDto, key?: string) {
    const issue = await this.access.issue(c, issueId, true);
    await this.writable(c, issue.projectId);
    return this.commands.run(c, `claim:${c.token!.id}:${issueId}`, key, input, async (tx) => {
      await this.writable(c, issue.projectId);
      const current = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, include: { status: true } });
      if (current.version !== input.version) conflict();
      if (current.type === 'EPIC' || current.status.category === 'DONE')
        fail(422, 'Epic 和已完成事项不能领取');
      await this.expire(tx, { issueId });
      if (await tx.issueExecution.findFirst({ where: { issueId, status: 'RUNNING' } }))
        fail(409, '事项已有活动租约', 'LEASE_CONFLICT');
      const run = await tx.issueExecution.create({
        data: {
          issueId,
          projectId: issue.projectId,
          actorId: c.actorId,
          tokenId: c.token!.id,
          executor: input.executor,
          leaseExpiresAt: new Date(Date.now() + input.leaseMinutes * 60000),
        },
      });
      await this.activity.append(tx, c, run.projectId, issueId, 'EXECUTION_CLAIMED', {
        executionId: run.id,
        executor: run.executor,
        tokenId: run.tokenId,
      });
      return run;
    });
  }
  async list(
    c: ActorContext,
    projectId?: string,
    issueId?: string,
    options: {
      cursor?: string;
      page?: string;
      limit?: number;
      status?: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
    } = {},
  ) {
    if (issueId) {
      const issue = await this.access.issue(c, issueId);
      if (projectId && issue.projectId !== projectId) fail(404, '事项不存在');
      projectId = issue.projectId;
    }
    let projectIds: string[];
    if (projectId) {
      await this.access.project(c, projectId);
      projectIds = [projectId];
    } else {
      const member = await this.access.workspace(c);
      projectIds = (
        await this.db.client.project.findMany({
          where: {
            workspaceId: c.workspaceId,
            ...(c.token ? { id: { in: c.token.projectIds } } : {}),
            ...(member.role === 'ADMIN' ? {} : { members: { some: { actorId: c.actorId } } }),
          },
          select: { id: true },
        })
      ).map((p) => p.id);
    }
    const where = { projectId: { in: projectIds }, ...(issueId ? { issueId } : {}) };
    return this.commands.run(c, 'execution-list', undefined, {}, async (tx) => {
      await this.expire(tx, where);
      const filtered = { ...where, ...(options.status ? { status: options.status } : {}) };
      const anchor = options.cursor
        ? await tx.issueExecution.findFirst({ where: { ...where, id: options.cursor } })
        : undefined;
      if (options.cursor && !anchor) fail(404, '执行游标不存在');
      const limit = options.limit ?? 50;
      const rows = await tx.issueExecution.findMany({
        where: {
          ...filtered,
          ...(anchor
            ? {
                OR: [
                  { createdAt: { lt: anchor.createdAt } },
                  { createdAt: anchor.createdAt, id: { lt: anchor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: options.page === 'true' ? limit + 1 : limit,
      });
      if (options.page !== 'true') return rows;
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
    });
  }
  async get(c: ActorContext, id: string) {
    const run = await this.db.client.issueExecution.findUnique({ where: { id } });
    if (!run) fail(404, '执行不存在');
    await this.access.project(c, run.projectId);
    return this.commands.run(c, 'execution-get', undefined, {}, async (tx) => {
      await this.expire(tx, { id });
      return tx.issueExecution.findUniqueOrThrow({ where: { id } });
    });
  }
  async change(c: ActorContext, id: string, input: RenewDto | FinishDto, key?: string) {
    const before = await this.get(c, id);
    await this.writable(c, before.projectId);
    if (before.tokenId !== c.token!.id) fail(403, '仅原领取令牌可更新执行');
    return this.commands.run(
      c,
      `execution:${c.token!.id}:${id}:${'outcome' in input ? 'finish' : 'renew'}`,
      key,
      input,
      async (tx) => {
        await this.writable(c, before.projectId);
        const run = await tx.issueExecution.findUniqueOrThrow({ where: { id } });
        if (run.status !== 'RUNNING' || run.leaseExpiresAt <= new Date())
          fail(409, '执行租约已结束或过期', 'LEASE_CONFLICT');
        if (run.version !== input.version) conflict();
        const updated = await tx.issueExecution.update({
          where: { id },
          data: {
            version: { increment: 1 },
            ...('outcome' in input
              ? { status: input.outcome, summary: input.summary, prUrl: input.prUrl, finishedAt: new Date() }
              : { leaseExpiresAt: new Date(Date.now() + input.leaseMinutes * 60000) }),
          },
        });
        await this.activity.append(
          tx,
          c,
          run.projectId,
          run.issueId,
          'outcome' in input ? 'EXECUTION_FINISHED' : 'EXECUTION_RENEWED',
          {
            executionId: id,
            executor: run.executor,
            tokenId: run.tokenId,
            status: updated.status,
            ...('outcome' in input ? { summary: input.summary, prUrl: input.prUrl ?? null } : {}),
          },
        );
        return updated;
      },
    );
  }
}

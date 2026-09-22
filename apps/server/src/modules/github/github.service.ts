import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db } from '../../common/db.js';
import { AccessService } from '../auth/access.service.js';
import { fail } from '../../common/errors.js';
import { CommandService } from '../../common/command.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { GitHubClient } from './github.client.js';
import type { ActorContext } from '../../../../../packages/shared/src/contracts.js';
import type { ConnectGitHubDto, UpdateGitHubDto } from './github.dto.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
@Injectable()
export class GitHubService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(AccessService) private access: AccessService,
    @Inject(GitHubClient) private client: GitHubClient,
    @Inject(CommandService) private commands: CommandService,
    @Inject(ActivityRepository) private activities: ActivityRepository,
  ) {}
  async settings(c: ActorContext, projectId: string) {
    await this.access.project(c, projectId, 'ADMIN');
    const repos = await this.db.client.gitHubRepository.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      configured: this.client.configured(),
      webhookConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
      webhookUrl: `${process.env.APP_URL ?? 'http://localhost:3004'}/api/github/webhook`,
      appUrl: process.env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG)}/installations/new`
        : null,
      repositories: repos.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        installationId: r.installationId,
        enabled: r.enabled,
        rules: r.rules,
        lastSyncedAt: r.lastSyncedAt,
        lastError: r.lastError,
        syncing: !!r.requestedAt && !r.lastError,
      })),
    };
  }
  async connect(c: ActorContext, projectId: string, input: ConnectGitHubDto) {
    await this.access.project(c, projectId, 'ADMIN');
    if (!this.client.configured()) fail(422, '请先由部署管理员配置 GitHub App');
    // An installation ID is public, not authorization: deployment explicitly grants it to projects.
    let grants: Record<string, string[]> = {};
    try {
      grants = JSON.parse(process.env.GITHUB_INSTALLATION_PROJECTS || '{}');
    } catch {
      fail(503, 'GitHub 安装授权配置无效');
    }
    if (!Array.isArray(grants[projectId]) || !grants[projectId].includes(input.installationId))
      fail(
        403,
        `此项目未获授权使用该 GitHub 安装，请部署管理员配置 GITHUB_INSTALLATION_PROJECTS（项目 ID：${projectId}）`,
      );
    const remote = await this.client.repository(input.fullName, input.installationId);
    return this.commands.run(c, 'github.connect', undefined, input, async (tx) => {
      const repo = await tx.gitHubRepository.create({
        data: {
          projectId,
          githubId: String(remote.id),
          fullName: remote.full_name,
          installationId: input.installationId,
        },
      });
      await this.activities.append(tx, c, projectId, null, 'GITHUB_CONNECTED', { repository: repo.fullName });
      return { id: repo.id };
    });
  }
  async update(c: ActorContext, projectId: string, id: string, input: UpdateGitHubDto) {
    await this.access.project(c, projectId, 'ADMIN');
    return this.commands.run(c, 'github.update', undefined, input, async (tx) => {
      const repo = await tx.gitHubRepository.findFirst({ where: { id, projectId } });
      if (!repo) fail(404, '仓库绑定不存在');
      if (input.rules) {
        const statuses = await tx.status.findMany({ where: { projectId } });
        const ids = new Set(statuses.map((s) => s.id));
        const events = new Set<string>();
        for (const r of input.rules) {
          if (
            !r ||
            !['OPENED', 'REVIEW_REQUESTED', 'MERGED'].includes(r.event) ||
            events.has(r.event) ||
            typeof r.enabled !== 'boolean' ||
            !Array.isArray(r.fromStatusIds) ||
            r.fromStatusIds.length > 100 ||
            typeof r.targetStatusId !== 'string'
          )
            fail(400, '自动化规则格式不正确');
          events.add(r.event);
          if (r.fromStatusIds.some((s) => !ids.has(s)) || (r.targetStatusId && !ids.has(r.targetStatusId)))
            fail(422, '规则状态必须属于当前项目');
          if (r.enabled && (!r.fromStatusIds.length || !ids.has(r.targetStatusId)))
            fail(422, '启用规则需要来源状态和目标状态');
          if (r.enabled && r.fromStatusIds.includes(r.targetStatusId))
            fail(422, '目标状态不能同时是来源状态');
        }
      }
      await tx.gitHubRepository.update({
        where: { id },
        data: {
          ...(input.enabled !== undefined
            ? {
                enabled: input.enabled,
                leaseToken: null,
                leaseUntil: null,
                requestedAt: input.enabled ? new Date() : null,
              }
            : {}),
          ...(input.rules ? { rules: input.rules as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      await this.activities.append(tx, c, projectId, null, 'GITHUB_SETTINGS_UPDATED', {
        repository: repo.fullName,
      });
      return { updated: true };
    });
  }
  async sync(c: ActorContext, projectId: string, id: string) {
    await this.access.project(c, projectId, 'ADMIN');
    const changed = await this.db.client.gitHubRepository.updateMany({
      where: { id, projectId, enabled: true },
      data: { requestedAt: new Date(), lastError: null, retryAt: null, attempts: 0 },
    });
    if (!changed.count) fail(404, '仓库未连接或已停用');
    return { queued: true };
  }
  async development(c: ActorContext, issueId: string) {
    await this.access.issue(c, issueId);
    const pulls = await this.db.client.gitHubPullRequest.findMany({
      where: { links: { some: { issueId } } },
      include: { repository: true },
      orderBy: { remoteUpdatedAt: 'desc' },
      take: 100,
    });
    const commits = await this.db.client.gitHubCommit.findMany({
      where: { links: { some: { issueId } } },
      include: { repository: true },
      orderBy: { committedAt: 'desc' },
      take: 100,
    });
    return {
      pullRequests: pulls.map((p) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        url: `https://github.com/${p.repository.fullName}/pull/${p.number}`,
        state: p.state,
        draft: p.draft,
        branch: p.branch,
        author: p.author,
        repository: p.repository.fullName,
      })),
      commits: commits.map((p) => ({
        id: p.id,
        sha: p.sha,
        message: p.message,
        url: `https://github.com/${p.repository.fullName}/commit/${p.sha}`,
        author: p.author,
        repository: p.repository.fullName,
      })),
    };
  }
  async systemContext(projectId: string): Promise<ActorContext> {
    const project = await this.db.client.project.findUniqueOrThrow({ where: { id: projectId } });
    const actor = await this.db.client.actor.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      create: { id: '00000000-0000-4000-8000-000000000001', name: 'GitHub', kind: 'SYSTEM' },
      update: {},
    });
    return {
      actorId: actor.id,
      actorName: 'GitHub',
      workspaceId: project.workspaceId,
      source: 'SYSTEM',
      requestId: randomUUID(),
    };
  }
}

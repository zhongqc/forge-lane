import { Injectable, Inject } from '@nestjs/common';
import { Db } from '../../common/db.js';
import { CommandService } from '../../common/command.service.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { GitHubService } from './github.service.js';
import type { RemotePR, RemoteCommit } from './github.client.js';
import type { Prisma } from '../../../../../packages/db/src/client.js';
import type { GitHubRule } from '../../../../../packages/shared/src/github.js';
export function referenceNumbers(text: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...new Set(
      [...text.matchAll(new RegExp(`(?<![A-Z0-9])${escaped}-([1-9][0-9]*)(?![A-Z0-9])`, 'g'))]
        .map((m) => Number(m[1]))
        .filter(Number.isSafeInteger),
    ),
  ];
}
@Injectable()
export class GitHubProcessor {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(CommandService) private commands: CommandService,
    @Inject(ActivityRepository) private activities: ActivityRepository,
    @Inject(GitHubService) private service: GitHubService,
  ) {}
  async apply(
    repositoryId: string,
    pulls: RemotePR[],
    commits: RemoteCommit[],
    options: {
      leaseToken?: string;
      startedAt?: Date;
      branch?: string;
      deliveryId?: string;
      fullName?: string;
    } = {},
  ) {
    const repository = await this.db.client.gitHubRepository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    const c = await this.service.systemContext(repository.projectId);
    if (options.deliveryId) c.requestId = options.deliveryId;
    return this.commands.run(c, 'github.apply', undefined, {}, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repositoryId}::uuid FOR UPDATE`;
      const repo = await tx.gitHubRepository.findUniqueOrThrow({
        where: { id: repositoryId },
        include: { project: true },
      });
      if (!repo.enabled || (options.leaseToken && repo.leaseToken !== options.leaseToken)) return;
      if (options.fullName && options.fullName !== repo.fullName) {
        await tx.gitHubRepository.update({ where: { id: repo.id }, data: { fullName: options.fullName } });
        repo.fullName = options.fullName;
      }
      const holdPending =
        !!options.deliveryId ||
        (!options.startedAt && !!(repo.requestedAt || repo.lastError || repo.leaseToken));
      const pending = repo.pendingAutomations;
      const transitions: {
        prId: string;
        event: GitHubRule['event'];
        issueIds: string[];
        title: string;
        url: string;
        author: string;
      }[] = (holdPending ? [] : pending) as unknown as {
        prId: string;
        event: GitHubRule['event'];
        issueIds: string[];
        title: string;
        url: string;
        author: string;
      }[];
      const deferred: typeof transitions = holdPending ? (pending as unknown as typeof transitions) : [];
      for (const p of pulls) {
        const existing = await tx.gitHubPullRequest.findUnique({
          where: { repositoryId_number: { repositoryId, number: p.number } },
        });
        if (existing && existing.remoteUpdatedAt.getTime() > new Date(p.updated_at).getTime()) continue;
        const state = p.merged_at ? 'MERGED' : p.state === 'closed' ? 'CLOSED' : 'OPEN';
        const reviewRequested = !!((p.requested_reviewers?.length ?? 0) + (p.requested_teams?.length ?? 0));
        const pr = await tx.gitHubPullRequest.upsert({
          where: { repositoryId_number: { repositoryId, number: p.number } },
          create: {
            repositoryId,
            number: p.number,
            title: p.title,
            body: p.body ?? '',
            branch: p.head.ref,
            url: `https://github.com/${repo.fullName}/pull/${p.number}`,
            state,
            draft: !!p.draft,
            reviewRequested,
            author: p.user.login,
            remoteUpdatedAt: new Date(p.updated_at),
          },
          update: {
            url: `https://github.com/${repo.fullName}/pull/${p.number}`,
            title: p.title,
            body: p.body ?? '',
            branch: p.head.ref,
            state,
            draft: !!p.draft,
            reviewRequested,
            author: p.user.login,
            remoteUpdatedAt: new Date(p.updated_at),
          },
        });
        const issues = await tx.issue.findMany({
          where: {
            projectId: repo.projectId,
            number: { in: referenceNumbers(`${p.title}\n${p.body ?? ''}\n${p.head.ref}`, repo.project.key) },
            type: { not: 'EPIC' },
          },
        });
        for (const issue of issues) {
          const link = await tx.gitHubPullRequestLink.createMany({
            data: [{ pullRequestId: pr.id, issueId: issue.id }],
            skipDuplicates: true,
          });
          if (link.count)
            await this.activities.append(tx, c, repo.projectId, issue.id, 'GITHUB_PR_LINKED', {
              title: pr.title,
              url: pr.url,
              repository: repo.fullName,
              githubActor: pr.author,
              state,
            });
        }
        const allLinks = await tx.gitHubPullRequestLink.findMany({ where: { pullRequestId: pr.id } });
        if (
          existing &&
          (existing.state !== state ||
            existing.draft !== pr.draft ||
            existing.reviewRequested !== reviewRequested ||
            existing.title !== pr.title)
        ) {
          for (const link of allLinks)
            await this.activities.append(tx, c, repo.projectId, link.issueId, 'GITHUB_PR_UPDATED', {
              title: pr.title,
              url: pr.url,
              repository: repo.fullName,
              githubActor: pr.author,
              state,
            });
        }
        if (repo.lastSyncedAt) {
          const events: GitHubRule['event'][] = [];
          if (state === 'MERGED' && existing?.state !== 'MERGED') events.push('MERGED');
          if (state === 'OPEN' && !pr.draft) {
            if (!existing || existing.state !== 'OPEN' || existing.draft) events.push('OPENED');
            if (reviewRequested && !existing?.reviewRequested) events.push('REVIEW_REQUESTED');
          }
          for (const event of events)
            transitions.push({
              prId: pr.id,
              event,
              issueIds: allLinks.map((l) => l.issueId),
              title: pr.title,
              url: pr.url,
              author: pr.author,
            });
        }
      }
      for (const commit of commits) {
        if (!/^[a-f0-9]{40,64}$/i.test(commit.sha)) continue;
        const record = await tx.gitHubCommit.upsert({
          where: { repositoryId_sha: { repositoryId, sha: commit.sha } },
          create: {
            repositoryId,
            sha: commit.sha,
            message: commit.commit.message,
            url: `https://github.com/${repo.fullName}/commit/${commit.sha}`,
            author: commit.author?.login ?? commit.commit.author.name,
            committedAt: new Date(commit.commit.author.date),
          },
          update: {},
        });
        const issues = await tx.issue.findMany({
          where: {
            projectId: repo.projectId,
            type: { not: 'EPIC' },
            number: {
              in: referenceNumbers(`${commit.commit.message}\n${options.branch ?? ''}`, repo.project.key),
            },
          },
        });
        for (const issue of issues) {
          const link = await tx.gitHubCommitLink.createMany({
            data: [{ commitId: record.id, issueId: issue.id }],
            skipDuplicates: true,
          });
          if (link.count)
            await this.activities.append(tx, c, repo.projectId, issue.id, 'GITHUB_COMMIT_LINKED', {
              title: record.message.split('\n')[0],
              url: record.url,
              repository: repo.fullName,
              githubActor: record.author,
            });
        }
      }
      for (const transition of transitions) {
        const rule = (repo.rules as unknown as GitHubRule[]).find(
          (r) => r.event === transition.event && r.enabled,
        );
        if (!rule) continue;
        for (const issueId of transition.issueIds) {
          const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId } });
          if (issue.type === 'EPIC' || !rule.fromStatusIds.includes(issue.statusId)) continue;
          if (transition.event === 'MERGED') {
            const related = await tx.gitHubPullRequest.findMany({
              where: { links: { some: { issueId } } },
              include: { repository: true },
            });
            if (
              related.some(
                (p) =>
                  p.state !== 'MERGED' ||
                  (p.repositoryId !== repo.id &&
                    (!p.repository.enabled || p.repository.requestedAt || p.repository.lastError)),
              )
            ) {
              deferred.push({ ...transition, issueIds: [issueId] });
              continue;
            }
          }
          const target = await tx.status.findFirst({
            where: { id: rule.targetStatusId, projectId: repo.projectId },
          });
          if (!target) continue;
          await tx.issue.update({
            where: { id: issueId },
            data: { statusId: target.id, version: { increment: 1 } },
          });
          await this.activities.append(
            tx,
            c,
            repo.projectId,
            issueId,
            'GITHUB_AUTOMATION',
            {
              title: transition.title,
              url: transition.url,
              repository: repo.fullName,
              githubActor: transition.author,
              event: transition.event,
              statusId: { before: issue.statusId, after: target.id },
            },
            issue.version + 1,
          );
        }
      }
      await tx.gitHubRepository.update({
        where: { id: repo.id },
        data: { pendingAutomations: deferred as unknown as Prisma.InputJsonValue },
      });
      if (options.startedAt)
        await tx.gitHubRepository.update({
          where: { id: repo.id },
          data: {
            lastSyncedAt: options.startedAt,
            lastError: null,
            attempts: 0,
            retryAt: null,
            leaseToken: null,
            leaseUntil: null,
            requestedAt: repo.requestedAt && repo.requestedAt > options.startedAt ? repo.requestedAt : null,
          },
        });
    });
  }
}

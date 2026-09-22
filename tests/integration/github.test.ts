import { afterAll, beforeAll, expect, it, vi, type MockInstance } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { Db } from '../../apps/server/src/common/db';
import {
  GitHubClient,
  GitHubError,
  type RemotePR,
  type RemoteCommit,
} from '../../apps/server/src/modules/github/github.client';
import { GitHubWorker } from '../../apps/server/src/modules/github/github.worker';
import type { BoardData, Issue } from '../../packages/shared/src/contracts';

let app: INestApplication;
let admin: ReturnType<typeof request.agent>;
let viewer: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;
let db: Db;
let worker: GitHubWorker;
let projectId: string;
let otherProjectId: string;
let statusIds: string[];
let repoSequence = 0;
const repositories: string[] = [];
const snapshots = new Map<string, { pulls: RemotePR[]; commits: RemoteCommit[] }>();
const secret = 'integration-github-webhook-secret';
const installationId = '123';
const oldEnv = Object.fromEntries(
  ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_INSTALLATION_PROJECTS'].map(
    (key) => [key, process.env[key]],
  ),
);
let snapshotMock: MockInstance<GitHubClient['snapshot']>;

beforeAll(async () => {
  process.env.GITHUB_APP_ID = 'integration-app';
  process.env.GITHUB_APP_PRIVATE_KEY = 'mocked-only-no-real-network';
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  app = await createApp();
  // Keep one listener for this suite; Supertest must not close it between requests.
  await app.listen(0, '127.0.0.1');
  db = app.get(Db);
  worker = app.get(GitHubWorker);
  const client = app.get(GitHubClient);
  vi.spyOn(client, 'repository').mockImplementation(async (fullName) => ({
    id: ++repoSequence + 900000,
    full_name: fullName,
  }));
  snapshotMock = vi.spyOn(client, 'snapshot').mockImplementation(async (fullName) => ({
    ...(snapshots.get(fullName) ?? { pulls: [], commits: [] }),
    fullName,
  }));
  admin = request.agent(app.getHttpServer());
  viewer = request.agent(app.getHttpServer());
  outsider = request.agent(app.getHttpServer());
  const tag = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const viewerEmail = `github-viewer-${tag}@forge.test`;
  for (const [agent, email] of [
    [admin, `github-admin-${tag}@forge.test`],
    [viewer, viewerEmail],
    [outsider, `github-outsider-${tag}@forge.test`],
  ] as const) {
    await agent
      .post('/api/auth/register')
      .send({ email, password: 'Github-integration-2026', name: 'GitHub 验证' })
      .expect(201);
  }
  projectId = (
    await admin
      .post('/api/projects')
      .send({ name: 'GitHub integration', key: `G${tag}` })
      .expect(201)
  ).body.id;
  otherProjectId = (
    await admin
      .post('/api/projects')
      .send({ name: 'GitHub isolation', key: `H${tag}` })
      .expect(201)
  ).body.id;
  process.env.GITHUB_INSTALLATION_PROJECTS = JSON.stringify({ [projectId]: [installationId] });
  const board: BoardData = (await admin.get(`/api/projects/${projectId}/board`).expect(200)).body;
  statusIds = [
    ...new Set(board.columns.flatMap((column) => column.statuses.map((status) => status.statusId))),
  ];
  expect(statusIds.length).toBeGreaterThanOrEqual(4);
  const member = (
    await admin.post('/api/workspace/members').send({ email: viewerEmail, role: 'VIEWER' }).expect(201)
  ).body;
  await admin
    .post(`/api/projects/${projectId}/members`)
    .send({ actorId: member.actorId, role: 'VIEWER' })
    .expect(201);
  const workspaceId = (await admin.get('/api/me').expect(200)).body.workspace.id;
  await viewer.post('/api/workspaces/select').send({ workspaceId }).expect(201);
});

afterAll(async () => {
  // Only stop this suite's repositories; never reset or seed the shared database.
  if (db && repositories.length)
    await db.client.gitHubRepository.updateMany({
      where: { id: { in: repositories } },
      data: { enabled: false, requestedAt: null },
    });
  vi.restoreAllMocks();
  await app?.close();
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const issue = async (title: string, type = 'TASK', project = projectId): Promise<Issue> =>
  (
    await admin
      .post(`/api/projects/${project}/issues`)
      .send({ title, type, ...(project === projectId ? { statusId: statusIds[0] } : {}) })
      .expect(201)
  ).body;
const readIssue = async (id: string): Promise<Issue> =>
  (await admin.get(`/api/issues/${id}`).expect(200)).body;
const development = async (id: string) => (await admin.get(`/api/issues/${id}/development`).expect(200)).body;
const pr = (number: number, reference: string, overrides: Partial<RemotePR> = {}): RemotePR => ({
  number,
  title: `Implement ${reference}`,
  body: null,
  html_url: `https://github.com/forge/test/pull/${number}`,
  state: 'open',
  merged_at: null,
  draft: false,
  updated_at: new Date().toISOString(),
  head: { ref: `feature/${reference}` },
  user: { login: 'octocat' },
  requested_reviewers: [],
  ...overrides,
});
const merged = (pull: RemotePR): RemotePR => ({
  ...pull,
  state: 'closed',
  merged_at: new Date().toISOString(),
  updated_at: new Date(Date.now() + 1000).toISOString(),
});
async function connect() {
  const fullName = `forge/integration-${randomUUID()}`;
  const { body } = await admin
    .post(`/api/projects/${projectId}/github`)
    .send({ fullName, installationId })
    .expect(201);
  repositories.push(body.id);
  const repository = await db.client.gitHubRepository.findUniqueOrThrow({ where: { id: body.id } });
  snapshots.set(fullName, { pulls: [], commits: [] });
  return repository;
}
async function rules(repoId: string) {
  await admin
    .patch(`/api/projects/${projectId}/github/${repoId}`)
    .send({
      rules: [
        { event: 'OPENED', enabled: true, fromStatusIds: [statusIds[0]], targetStatusId: statusIds[1] },
        {
          event: 'REVIEW_REQUESTED',
          enabled: true,
          fromStatusIds: [statusIds[1]],
          targetStatusId: statusIds[2],
        },
        {
          event: 'MERGED',
          enabled: true,
          fromStatusIds: [statusIds[0], statusIds[1], statusIds[2]],
          targetStatusId: statusIds[3],
        },
      ],
    })
    .expect(200);
}
async function sync(repoId: string) {
  await admin.post(`/api/projects/${projectId}/github/${repoId}/sync`).expect(201);
  await worker.tick();
}
async function webhook(
  githubId: string,
  delivery = randomUUID(),
  event = 'pull_request',
  data: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    action: 'opened',
    installation: { id: Number(installationId) },
    repository: { id: Number(githubId) },
    ...data,
  });
  const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const response = await request(app.getHttpServer())
    .post('/api/github/webhook')
    .set('Content-Type', 'application/json')
    .set('x-hub-signature-256', signature)
    .set('x-github-delivery', delivery)
    .set('x-github-event', event)
    .send(payload);
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return delivery;
}

it('requires project admin and deployment installation grants without leaking development', async () => {
  const item = await issue('permission boundary');
  await viewer.get(`/api/projects/${projectId}/github`).expect(403);
  await viewer
    .post(`/api/projects/${projectId}/github`)
    .send({ fullName: 'forge/private', installationId })
    .expect(403);
  await outsider.get(`/api/projects/${projectId}/github`).expect(404);
  await outsider.get(`/api/issues/${item.id}/development`).expect(404);
  await viewer.get(`/api/issues/${item.id}/development`).expect(200);
  await admin
    .post(`/api/projects/${otherProjectId}/github`)
    .send({ fullName: 'forge/private', installationId })
    .expect(403);
  const settings = (await admin.get(`/api/projects/${projectId}/github`).expect(200)).body;
  expect(settings.configured).toBe(true);
  expect(JSON.stringify(settings)).not.toContain(process.env.GITHUB_APP_PRIVATE_KEY);
});

it('rejects unsigned or forged webhooks and deduplicates verified deliveries', async () => {
  const repo = await connect();
  const delivery = randomUUID();
  for (const signature of ['', 'sha256=bad', `sha256=${'0'.repeat(64)}`]) {
    await request(app.getHttpServer())
      .post('/api/github/webhook')
      .set('x-github-delivery', delivery)
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .send({ repository: { id: Number(repo.githubId) } })
      .expect(401);
  }
  expect(await db.client.gitHubDelivery.count({ where: { id: delivery } })).toBe(0);
  await webhook(repo.githubId, delivery);
  await webhook(repo.githubId, delivery);
  expect(await db.client.gitHubDelivery.count({ where: { id: delivery } })).toBe(1);
  await worker.tick();
  expect(
    (await db.client.gitHubDelivery.findUniqueOrThrow({ where: { id: delivery } })).processedAt,
  ).not.toBeNull();
});

it('imports PRs and commits without automation, isolates project refs, and excludes Epics', async () => {
  const repo = await connect();
  const item = await issue('initial import');
  const epic = await issue('excluded epic', 'EPIC');
  const foreign = await issue('other project', 'TASK', otherProjectId);
  await rules(repo.id);
  const message = `Fix ${item.key} and ${epic.key} and ${foreign.key}`;
  snapshots.set(repo.fullName, {
    pulls: [pr(1, item.key, { body: message })],
    commits: [
      {
        sha: 'a'.repeat(40),
        html_url: 'https://github.com/forge/test/commit/abc',
        author: { login: 'octocat' },
        commit: { message, author: { name: 'Octocat', date: new Date().toISOString() } },
      },
    ],
  });
  await worker.tick();
  const dev = await development(item.id);
  expect(dev.pullRequests).toHaveLength(1);
  expect(dev.commits).toHaveLength(1);
  expect(dev.pullRequests[0]).toMatchObject({ number: 1, author: 'octocat', repository: repo.fullName });
  expect(await development(epic.id)).toMatchObject({ pullRequests: [], commits: [] });
  expect(await development(foreign.id)).toMatchObject({ pullRequests: [], commits: [] });
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[0], version: item.version });
});

it('applies opened, review and merge edges once using authoritative snapshots', async () => {
  const repo = await connect();
  await rules(repo.id);
  await worker.tick();
  const item = await issue('lifecycle');
  const opened = pr(2, item.key);
  snapshots.set(repo.fullName, { pulls: [opened], commits: [] });
  const delivery = await webhook(repo.githubId);
  await worker.tick();
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[1], version: item.version + 1 });
  await webhook(repo.githubId, delivery);
  await worker.tick();
  await sync(repo.id);
  expect((await readIssue(item.id)).version).toBe(item.version + 1);
  const review = {
    ...opened,
    requested_reviewers: [{ login: 'reviewer' }],
    updated_at: new Date(Date.now() + 500).toISOString(),
  };
  snapshots.set(repo.fullName, { pulls: [review], commits: [] });
  await webhook(repo.githubId);
  await worker.tick();
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[2], version: item.version + 2 });
  snapshots.set(repo.fullName, { pulls: [merged(review)], commits: [] });
  // The webhook action remains "opened": API state must win over delivery order/payload.
  await webhook(repo.githubId);
  await worker.tick();
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[3], version: item.version + 3 });
  await sync(repo.id);
  expect((await readIssue(item.id)).version).toBe(item.version + 3);
  const history = (await admin.get(`/api/issues/${item.id}/activities`).expect(200)).body.items;
  expect(history.filter((entry: { type: string }) => entry.type === 'GITHUB_AUTOMATION')).toHaveLength(3);
});

it('waits for all linked pull requests to merge', async () => {
  const repo = await connect();
  await rules(repo.id);
  const item = await issue('two linked PRs');
  const first = pr(3, item.key),
    second = pr(4, item.key);
  snapshots.set(repo.fullName, { pulls: [first, second], commits: [] });
  await worker.tick();
  snapshots.set(repo.fullName, { pulls: [merged(first), second], commits: [] });
  await sync(repo.id);
  expect((await readIssue(item.id)).statusId).toBe(statusIds[0]);
  snapshots.set(repo.fullName, { pulls: [merged(first), merged(second)], commits: [] });
  await sync(repo.id);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[3], version: item.version + 1 });
});

it('surfaces retryable failure, respects retry delay, and allows manual retry', async () => {
  const repo = await connect();
  const retryAt = new Date(Date.now() + 600000);
  snapshotMock.mockRejectedValueOnce(new GitHubError('GitHub rate limit test', retryAt));
  await worker.tick();
  const failed = await db.client.gitHubRepository.findUniqueOrThrow({ where: { id: repo.id } });
  expect(failed.lastError).toContain('GitHub rate limit test');
  expect(failed.attempts).toBeGreaterThan(0);
  expect(failed.retryAt!.getTime()).toBeGreaterThanOrEqual(retryAt.getTime());
  const calls = snapshotMock.mock.calls.length;
  await worker.tick();
  expect(snapshotMock.mock.calls.length).toBe(calls);
  await sync(repo.id);
  const recovered = await db.client.gitHubRepository.findUniqueOrThrow({ where: { id: repo.id } });
  expect(recovered.lastError).toBeNull();
  expect(recovered.lastSyncedAt).not.toBeNull();
});

it('validates rules and preserves development history after disabling a repository', async () => {
  const repo = await connect();
  const item = await issue('retained development');
  snapshots.set(repo.fullName, { pulls: [pr(5, item.key)], commits: [] });
  await worker.tick();
  await admin
    .patch(`/api/projects/${projectId}/github/${repo.id}`)
    .send({
      rules: [
        { event: 'OPENED', enabled: true, fromStatusIds: [statusIds[0]], targetStatusId: randomUUID() },
      ],
    })
    .expect(422);
  await viewer.patch(`/api/projects/${projectId}/github/${repo.id}`).send({ enabled: false }).expect(403);
  await viewer.post(`/api/projects/${projectId}/github/${repo.id}/sync`).expect(403);
  await admin.patch(`/api/projects/${otherProjectId}/github/${repo.id}`).send({ enabled: false }).expect(404);
  await admin.patch(`/api/projects/${projectId}/github/${repo.id}`).send({ enabled: false }).expect(200);
  await admin.post(`/api/projects/${projectId}/github/${repo.id}/sync`).expect(404);
  expect((await development(item.id)).pullRequests).toHaveLength(1);
});

it('does not trigger opened automation on a title edit after an issue returns to its source state', async () => {
  const repo = await connect();
  await rules(repo.id);
  await worker.tick();
  const item = await issue('do not repeat opened');
  const pull = pr(6, item.key);
  snapshots.set(repo.fullName, { pulls: [pull], commits: [] });
  await sync(repo.id);
  const openedIssue = await readIssue(item.id);
  expect(openedIssue.statusId).toBe(statusIds[1]);
  const reset = (
    await admin
      .patch(`/api/issues/${item.id}`)
      .send({ version: openedIssue.version, statusId: statusIds[0] })
      .expect(200)
  ).body;
  snapshots.set(repo.fullName, {
    pulls: [
      {
        ...pull,
        title: `Updated description ${item.key}`,
        updated_at: new Date(Date.now() + 1000).toISOString(),
      },
    ],
    commits: [],
  });
  await sync(repo.id);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[0], version: reset.version });
});

it('defers merge automation until another linked repository completes synchronization', async () => {
  const firstRepo = await connect();
  const secondRepo = await connect();
  await rules(firstRepo.id);
  await rules(secondRepo.id);
  const item = await issue('cross repository synchronization');
  const first = pr(7, item.key),
    second = pr(8, item.key);
  snapshots.set(firstRepo.fullName, { pulls: [first], commits: [] });
  snapshots.set(secondRepo.fullName, { pulls: [merged(second)], commits: [] });
  await worker.tick();
  expect((await development(item.id)).pullRequests).toHaveLength(2);
  // The other PR is locally merged, but its newer state is not yet reconciled.
  await db.client.gitHubRepository.update({
    where: { id: secondRepo.id },
    data: { requestedAt: new Date(), retryAt: new Date(Date.now() + 600000) },
  });
  snapshots.set(firstRepo.fullName, { pulls: [merged(first)], commits: [] });
  await sync(firstRepo.id);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[0], version: item.version });
  await sync(secondRepo.id);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[3], version: item.version + 1 });
  const networkCalls = snapshotMock.mock.calls.length;
  await worker.tick();
  expect(snapshotMock.mock.calls.length).toBe(networkCalls);
  expect((await readIssue(item.id)).version).toBe(item.version + 1);
});

it('keeps the GitHub API retry deadline when new webhook deliveries arrive', async () => {
  const repo = await connect();
  const retryAt = new Date(Date.now() + 600000);
  snapshotMock.mockRejectedValueOnce(new GitHubError('Respect GitHub retry-after', retryAt));
  await worker.tick();
  const calls = snapshotMock.mock.calls.length;
  for (let delivery = 0; delivery < 2; delivery++) {
    const deliveryId = await webhook(repo.githubId);
    await worker.tick();
    expect(snapshotMock.mock.calls.length).toBe(calls);
    const deferred = await db.client.gitHubRepository.findUniqueOrThrow({ where: { id: repo.id } });
    expect(deferred.retryAt?.getTime()).toBe(retryAt.getTime());
    expect(deferred.attempts).toBe(1);
    expect(deferred.requestedAt).not.toBeNull();
    expect(
      (await db.client.gitHubDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).processedAt,
    ).not.toBeNull();
  }
  await sync(repo.id);
  expect(snapshotMock.mock.calls.length).toBe(calls + 1);
  expect(
    (await db.client.gitHubRepository.findUniqueOrThrow({ where: { id: repo.id } })).lastError,
  ).toBeNull();
});

it('associates feature-branch push commits from a signed delivery exactly once', async () => {
  const repo = await connect();
  await worker.tick();
  const branchIssue = await issue('branch-only commit association');
  const messageIssue = await issue('message commit association', 'BUG');
  const sha = 'b'.repeat(40);
  const payload = {
    ref: `refs/heads/feature/${branchIssue.key}`,
    commits: [
      {
        id: sha,
        message: `Fix ${messageIssue.key}`,
        timestamp: new Date().toISOString(),
        author: { name: 'Octocat', username: 'octocat' },
      },
    ],
  };
  // The API default-branch snapshot remains empty; the signed push carries this commit.
  const delivery = await webhook(repo.githubId, randomUUID(), 'push', payload);
  await worker.tick();
  for (const item of [branchIssue, messageIssue]) {
    const dev = await development(item.id);
    expect(dev.commits).toHaveLength(1);
    expect(dev.commits[0]).toMatchObject({
      sha,
      message: `Fix ${messageIssue.key}`,
      author: 'octocat',
      url: `https://github.com/${repo.fullName}/commit/${sha}`,
    });
    expect((await readIssue(item.id)).version).toBe(item.version);
  }
  await webhook(repo.githubId, delivery, 'push', payload);
  await worker.tick();
  await webhook(repo.githubId, randomUUID(), 'push', payload);
  await worker.tick();
  expect((await development(branchIssue.id)).commits).toHaveLength(1);
  const activities = (await admin.get(`/api/issues/${branchIssue.id}/activities`).expect(200)).body.items;
  const linked = activities.filter((activity: { type: string }) => activity.type === 'GITHUB_COMMIT_LINKED');
  expect(linked).toHaveLength(1);
  expect(linked[0]).toMatchObject({
    source: 'SYSTEM',
    actorNameSnapshot: 'GitHub',
    payload: { githubActor: 'octocat', repository: repo.fullName },
  });
});

it('runs an opened-only rule when the newly opened PR already has requested reviewers', async () => {
  const repo = await connect();
  await admin
    .patch(`/api/projects/${projectId}/github/${repo.id}`)
    .send({
      rules: [
        { event: 'OPENED', enabled: true, fromStatusIds: [statusIds[0]], targetStatusId: statusIds[1] },
      ],
    })
    .expect(200);
  await worker.tick();
  const item = await issue('opened with reviewers');
  snapshots.set(repo.fullName, {
    pulls: [pr(9, item.key, { requested_reviewers: [{ login: 'reviewer' }] })],
    commits: [],
  });
  await webhook(repo.githubId);
  await worker.tick();
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[1], version: item.version + 1 });
  await sync(repo.id);
  expect((await readIssue(item.id)).version).toBe(item.version + 1);
});

it('does not release pending merge automation from a push before authoritative PR synchronization', async () => {
  const repo = await connect();
  const other = await connect();
  await rules(repo.id);
  const item = await issue('push must not release pending merge');
  const pull = pr(10, item.key);
  snapshots.set(repo.fullName, { pulls: [pull], commits: [] });
  snapshots.set(other.fullName, { pulls: [merged(pr(11, item.key))], commits: [] });
  await worker.tick();
  await db.client.gitHubRepository.update({
    where: { id: other.id },
    data: { requestedAt: new Date(), retryAt: new Date(Date.now() + 600000) },
  });
  snapshots.set(repo.fullName, { pulls: [merged(pull)], commits: [] });
  await sync(repo.id);
  expect((await readIssue(item.id)).statusId).toBe(statusIds[0]);
  // Simulate the other repository finishing while this repository awaits API reconciliation.
  await db.client.gitHubRepository.update({
    where: { id: other.id },
    data: { requestedAt: null, retryAt: null },
  });
  await db.client.gitHubRepository.update({
    where: { id: repo.id },
    data: { requestedAt: new Date(), retryAt: new Date(Date.now() + 600000) },
  });
  const calls = snapshotMock.mock.calls.length;
  await webhook(repo.githubId, randomUUID(), 'push', {
    ref: `refs/heads/feature/${item.key}`,
    commits: [
      {
        id: 'c'.repeat(40),
        message: 'Feature branch progress',
        timestamp: new Date().toISOString(),
        author: { name: 'Octocat', username: 'octocat' },
      },
    ],
  });
  await worker.tick();
  expect((await development(item.id)).commits).toHaveLength(1);
  expect(snapshotMock.mock.calls.length).toBe(calls);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[0], version: item.version });
  await sync(repo.id);
  expect(await readIssue(item.id)).toMatchObject({ statusId: statusIds[3], version: item.version + 1 });
});

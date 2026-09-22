import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { Db } from '../../apps/server/src/common/db';
let app: INestApplication;
let session: ReturnType<typeof request.agent>;
let projectId: string, otherProjectId: string, issueId: string, actorId: string;
let rw: { token: string; id: string },
  ro: { token: string; id: string },
  second: { token: string; id: string };
const bearer = (token = rw.token) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  app = await createApp();
  // Keep one listener for this suite; Supertest must not close it between requests.
  await app.listen(0, '127.0.0.1');
  session = request.agent(app.getHttpServer());
  await session
    .post('/api/auth/register')
    .send({ email: `cli-${Date.now()}@forge.test`, password: 'testing-strong-2026', name: 'CLI tester' })
    .expect(201);
  actorId = (await session.get('/api/me').expect(200)).body.actor.id;
  projectId = (
    await session
      .post('/api/projects')
      .send({ name: 'CLI project', key: `C${Date.now().toString(36).toUpperCase()}` })
      .expect(201)
  ).body.id;
  otherProjectId = (
    await session
      .post('/api/projects')
      .send({ name: 'Other', key: `D${Date.now().toString(36).toUpperCase()}` })
      .expect(201)
  ).body.id;
  issueId = (
    await session
      .post(`/api/projects/${projectId}/issues`)
      .send({ type: 'TASK', title: 'CLI task' })
      .expect(201)
  ).body.id;
  rw = (
    await session
      .post('/api/auth/tokens')
      .send({ name: 'writer', projectIds: [projectId], scopes: ['read', 'write'] })
      .expect(201)
  ).body;
  ro = (
    await session
      .post('/api/auth/tokens')
      .send({ name: 'reader', projectIds: [projectId], scopes: ['read'] })
      .expect(201)
  ).body;
  second = (
    await session
      .post('/api/auth/tokens')
      .send({ name: 'second writer', projectIds: [projectId], scopes: ['read', 'write'] })
      .expect(201)
  ).body;
}, 30000);
afterAll(async () => {
  await app?.close();
});
it('keeps token secrets hashed, enforces project and write scopes, disallows management and session fallback', async () => {
  const api = request(app.getHttpServer());
  const stored = await app.get(Db).client.apiToken.findUniqueOrThrow({ where: { id: rw.id } });
  expect(stored.digest).not.toBe(rw.token);
  expect(stored.digest).toHaveLength(64);
  const me = await api.get('/api/auth/whoami').set(bearer()).expect(200);
  expect(me.body.actor.id).toBe(actorId);
  expect(me.body.token.id).toBe(rw.id);
  const list = await api.get('/api/auth/tokens').set(bearer()).expect(200);
  expect(JSON.stringify(list.body)).not.toContain(rw.token);
  expect(JSON.stringify(list.body)).not.toContain(stored.digest);
  const projects = await api.get('/api/projects').set(bearer()).expect(200);
  expect(projects.body.map((p: { id: string }) => p.id)).toEqual([projectId]);
  await api.get(`/api/projects/${otherProjectId}/board`).set(bearer()).expect(404);
  await api.get(`/api/projects/${projectId}/github`).set(bearer()).expect(403);
  await api.post('/api/auth/tokens').set(bearer()).send({}).expect(403);
  await api.post('/api/workspaces/select').set(bearer()).send({}).expect(403);
  expect([403, 404]).toContain((await api.get('/API/WORKSPACES').set(bearer())).status);
  await api
    .post(`/api/projects/${projectId}/issues`)
    .set(bearer(ro.token))
    .send({ title: 'denied', type: 'TASK' })
    .expect(403);
  await api.post(`/api/issues/${issueId}/claim`).set(bearer(ro.token)).send({ version: 1 }).expect(403);
  await session.get('/api/projects').set(bearer('invalid')).expect(401);
  await session
    .post('/api/auth/tokens')
    .send({ name: 'bad', projectIds: [projectId], scopes: ['write'] })
    .expect(400);
  await session
    .post('/api/auth/tokens')
    .send({ name: 'bad', projectIds: [projectId], scopes: ['read'], expiresInDays: 91 })
    .expect(400);
});
it('returns only public repository context within the token project scope', async () => {
  const repository = await app.get(Db).client.gitHubRepository.create({
    data: {
      projectId,
      githubId: `cli-repo-${Date.now()}`,
      fullName: 'acme/cli-context',
      installationId: 'private-installation',
      rules: [{ secret: 'hidden' }],
      requestedAt: null,
    },
  });
  const api = request(app.getHttpServer());
  const result = await api.get(`/api/projects/${projectId}/repositories`).set(bearer(ro.token)).expect(200);
  expect(result.body).toEqual([
    {
      id: repository.id,
      fullName: 'acme/cli-context',
      url: 'https://github.com/acme/cli-context',
      enabled: true,
    },
  ]);
  await api.get(`/api/projects/${otherProjectId}/repositories`).set(bearer(ro.token)).expect(404);
});
it('serializes concurrent claims, preserves issue state and records one idempotent activity', async () => {
  const api = request(app.getHttpServer());
  const [a, b] = await Promise.all([
    api
      .post(`/api/issues/${issueId}/claim`)
      .set(bearer())
      .set('Idempotency-Key', 'claim-one')
      .send({ version: 1 }),
    api
      .post(`/api/issues/${issueId}/claim`)
      .set(bearer())
      .set('Idempotency-Key', 'claim-one')
      .send({ version: 1 }),
  ]);
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  expect(a.body.id).toBe(b.body.id);
  await api.post(`/api/issues/${issueId}/claim`).set(bearer(second.token)).send({ version: 1 }).expect(409);
  await api
    .post(`/api/executions/${a.body.id}/renew`)
    .set(bearer(second.token))
    .send({ version: 1 })
    .expect(403);
  const renewed = await api
    .post(`/api/executions/${a.body.id}/renew`)
    .set(bearer())
    .send({ version: 1, leaseMinutes: 120 })
    .expect(201);
  expect(renewed.body.version).toBe(2);
  await api
    .post(`/api/executions/${a.body.id}/finish`)
    .set(bearer())
    .send({ version: 1, outcome: 'SUCCEEDED', summary: 'stale' })
    .expect(409);
  const finish = {
    version: 2,
    outcome: 'SUCCEEDED',
    summary: 'implemented',
    prUrl: 'https://github.com/acme/repo/pull/1',
  };
  const completed = await api
    .post(`/api/executions/${a.body.id}/finish`)
    .set(bearer())
    .set('Idempotency-Key', 'finish-one')
    .send(finish)
    .expect(201);
  const retry = await api
    .post(`/api/executions/${a.body.id}/finish`)
    .set(bearer())
    .set('Idempotency-Key', 'finish-one')
    .send(finish)
    .expect(201);
  expect(retry.body).toEqual(completed.body);
  const issue = await api.get(`/api/issues/${issueId}`).set(bearer()).expect(200);
  expect(issue.body.version).toBe(1);
  expect(issue.body.assigneeId).toBeNull();
  expect(issue.body.status.category).toBe('TODO');
  const activity = await app
    .get(Db)
    .client.activity.findMany({ where: { issueId, type: 'EXECUTION_CLAIMED' } });
  expect(activity).toHaveLength(1);
  expect(activity[0].actorId).toBe(actorId);
  expect(activity[0].source).toBe('API');
});
it('allows exactly one competing token to claim and rejects Epic or Done claims', async () => {
  const api = request(app.getHttpServer());
  const task = (
    await session
      .post(`/api/projects/${projectId}/issues`)
      .send({ type: 'TASK', title: 'Concurrent task' })
      .expect(201)
  ).body;
  const outcomes = await Promise.all(
    [rw.token, second.token].map((token) =>
      api.post(`/api/issues/${task.id}/claim`).set(bearer(token)).send({ version: 1 }),
    ),
  );
  expect(outcomes.map((result) => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
  expect(
    await app.get(Db).client.issueExecution.count({ where: { issueId: task.id, status: 'RUNNING' } }),
  ).toBe(1);
  const epic = (
    await session.post(`/api/projects/${projectId}/issues`).send({ type: 'EPIC', title: 'Epic' }).expect(201)
  ).body;
  await api.post(`/api/issues/${epic.id}/claim`).set(bearer()).send({ version: 1 }).expect(422);
  const doneStatus = await app
    .get(Db)
    .client.status.findFirstOrThrow({ where: { projectId, category: 'DONE' } });
  const done = (
    await session
      .post(`/api/projects/${projectId}/issues`)
      .send({ type: 'TASK', title: 'Done', statusId: doneStatus.id })
      .expect(201)
  ).body;
  await api.post(`/api/issues/${done.id}/claim`).set(bearer()).send({ version: 1 }).expect(422);
});
it('expires leases explicitly, validates safe results, denies revoked and expired tokens', async () => {
  const api = request(app.getHttpServer());
  const claimed = await api
    .post(`/api/issues/${issueId}/claim`)
    .set(bearer())
    .send({ version: 1 })
    .expect(201);
  await api
    .post(`/api/executions/${claimed.body.id}/finish`)
    .set(bearer())
    .send({ version: 1, outcome: 'FAILED', summary: '', prUrl: 'https://github.com.evil.test/x/y/pull/1' })
    .expect(400);
  await app.get(Db).client.issueExecution.update({
    where: { id: claimed.body.id },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await api.get(`/api/executions/${claimed.body.id}`).set(bearer()).expect(200);
  expect(expired.body.status).toBe('EXPIRED');
  expect(expired.body.version).toBe(2);
  await api
    .post(`/api/executions/${claimed.body.id}/finish`)
    .set(bearer())
    .send({ version: 2, outcome: 'SUCCEEDED', summary: 'too late' })
    .expect(409);
  const replacement = await api
    .post(`/api/issues/${issueId}/claim`)
    .set(bearer(second.token))
    .send({ version: 1 })
    .expect(201);
  await api.delete(`/api/auth/tokens/${second.id}`).set(bearer()).expect(200);
  await api
    .post(`/api/executions/${replacement.body.id}/renew`)
    .set(bearer(second.token))
    .send({ version: 1 })
    .expect(401);
  await app
    .get(Db)
    .client.apiToken.update({ where: { id: ro.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await api.get('/api/projects').set(bearer(ro.token)).expect(401);
});
it('paginates accessible executions and filters active leases without leaking foreign cursors', async () => {
  const api = request(app.getHttpServer());
  const first = await api
    .get(`/api/executions?projectId=${projectId}&page=true&limit=1`)
    .set(bearer())
    .expect(200);
  expect(first.body.items).toHaveLength(1);
  expect(first.body.nextCursor).toBeTruthy();
  const next = await api
    .get(`/api/executions?projectId=${projectId}&page=true&limit=1&cursor=${first.body.nextCursor}`)
    .set(bearer())
    .expect(200);
  expect(next.body.items).toHaveLength(1);
  expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
  const active = await api
    .get(`/api/executions?projectId=${projectId}&page=true&status=RUNNING`)
    .set(bearer())
    .expect(200);
  expect(active.body.items.length).toBeGreaterThan(0);
  expect(active.body.items.every((run: { status: string }) => run.status === 'RUNNING')).toBe(true);
  const activePage = await api
    .get(`/api/executions?projectId=${projectId}&page=true&status=RUNNING&limit=1`)
    .set(bearer())
    .expect(200);
  expect(activePage.body.nextCursor).toBeTruthy();
  await app.get(Db).client.issueExecution.update({
    where: { id: activePage.body.nextCursor },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });
  const followingActivePage = await api
    .get(
      `/api/executions?projectId=${projectId}&page=true&status=RUNNING&limit=1&cursor=${activePage.body.nextCursor}`,
    )
    .set(bearer())
    .expect(200);
  expect(followingActivePage.body.items).toHaveLength(1);
  expect(followingActivePage.body.items[0].status).toBe('RUNNING');
  expect(followingActivePage.body.items[0].id).not.toBe(activePage.body.nextCursor);
  const foreign = await app.get(Db).client.issue.create({
    data: {
      projectId: otherProjectId,
      number: 1,
      title: 'Foreign task',
      type: 'TASK',
      reporterId: actorId,
      statusId: (await app.get(Db).client.status.findFirstOrThrow({ where: { projectId: otherProjectId } }))
        .id,
    },
  });
  const run = await app.get(Db).client.issueExecution.create({
    data: {
      issueId: foreign.id,
      projectId: otherProjectId,
      actorId,
      tokenId: rw.id,
      executor: 'test',
      leaseExpiresAt: new Date(Date.now() + 600000),
    },
  });
  await api.get(`/api/executions?page=true&cursor=${run.id}`).set(bearer()).expect(404);
});
it('isolates owners and intersects token access with live membership and actor state', async () => {
  const api = request(app.getHttpServer());
  const outsider = request.agent(app.getHttpServer());
  await outsider
    .post('/api/auth/register')
    .send({ email: `outsider-${Date.now()}@forge.test`, password: 'testing-strong-2026', name: 'Outsider' })
    .expect(201);
  expect((await outsider.get('/api/auth/tokens').expect(200)).body).toEqual([]);
  await outsider.delete(`/api/auth/tokens/${rw.id}`).expect(404);
  const outsiderProject = (
    await outsider
      .post('/api/projects')
      .send({ name: 'Foreign', key: `F${Date.now().toString(36).toUpperCase()}` })
      .expect(201)
  ).body;
  await session
    .post('/api/auth/tokens')
    .send({ name: 'foreign', projectIds: [outsiderProject.id], scopes: ['read'] })
    .expect(404);
  const foreignIssue = (
    await outsider
      .post(`/api/projects/${outsiderProject.id}/issues`)
      .send({ title: 'Hidden task', type: 'TASK' })
      .expect(201)
  ).body;
  await api.get(`/api/issues/${foreignIssue.id}/executions`).set(bearer()).expect(404);
  const db = app.get(Db).client;
  const token = await db.apiToken.findUniqueOrThrow({ where: { id: rw.id } });
  await db.workspaceMember.update({
    where: { workspaceId_actorId: { workspaceId: token.workspaceId, actorId } },
    data: { role: 'MEMBER' },
  });
  await db.projectMember.update({
    where: { projectId_actorId: { projectId, actorId } },
    data: { role: 'VIEWER' },
  });
  await api.get(`/api/issues/${issueId}`).set(bearer()).expect(200);
  await api.patch(`/api/issues/${issueId}`).set(bearer()).send({ version: 1, title: 'Denied' }).expect(403);
  await db.projectMember.delete({ where: { projectId_actorId: { projectId, actorId } } });
  await api.get(`/api/issues/${issueId}`).set(bearer()).expect(404);
  expect((await api.get('/api/executions').set(bearer()).expect(200)).body).toEqual([]);
  await db.actor.update({ where: { id: actorId }, data: { active: false } });
  await api.get('/api/auth/whoami').set(bearer()).expect(401);
});

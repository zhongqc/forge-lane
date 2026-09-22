import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { Db } from '../../apps/server/src/common/db';
import type { SprintOverview } from '../../packages/shared/src/contracts';
let app: INestApplication;
let session: ReturnType<typeof request.agent>;
let projectId: string, actorId: string, sprintId: string, issueId: string, doneId: string;
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  session = request.agent(app.getHttpServer());
  const tag = Date.now().toString(36).toUpperCase();
  await session
    .post('/api/auth/register')
    .send({ email: `sprint-summary-${tag}@forge.test`, password: 'Testing-sprints-2026', name: '估点成员' })
    .expect(201);
  actorId = (await session.get('/api/me')).body.actor.id;
  projectId = (
    await session
      .post('/api/projects')
      .send({ key: `S${tag}`, name: 'Sprint history' })
      .expect(201)
  ).body.id;
  const board = (await session.get(`/api/projects/${projectId}/board`)).body;
  doneId = board.statuses.find((s: { category: string }) => s.category === 'DONE').id;
  sprintId = (
    await session.post('/api/sprints').send({ projectId, name: '第一期', goal: '保留结束时数据' }).expect(201)
  ).body.id;
  await session.post(`/api/sprints/${sprintId}/start`).send({ version: 1 }).expect(201);
}, 30000);
afterAll(async () => {
  await app?.close();
});
it('counts full sprint by assignee with exact fractional points, zero, missing estimates and no subtask double-count', async () => {
  const create = (data: object) =>
    session
      .post(`/api/projects/${projectId}/issues`)
      .send({ type: 'TASK', title: '统计事项', sprintId, ...data })
      .expect(201);
  issueId = (await create({ estimate: 0.1, assigneeId: actorId })).body.id;
  await create({ estimate: 0.2, assigneeId: actorId, statusId: doneId });
  await create({ estimate: 0, assigneeId: actorId });
  await create({ estimate: null });
  await create({ type: 'SUBTASK', parentId: issueId, assigneeId: actorId, sprintId: undefined });
  const result = (await session.get(`/api/sprints/${sprintId}/overview`).expect(200)).body as SprintOverview;
  expect(result.issues).toHaveLength(4);
  expect(result.members.find((m) => m.actorId === actorId)).toMatchObject({
    issues: 3,
    total: 0.3,
    completed: 0.2,
    remaining: 0.1,
    unestimated: 0,
  });
  expect(result.members.find((m) => m.actorId === null)).toMatchObject({
    issues: 1,
    total: 0,
    unestimated: 1,
  });
});
it('captures before rollover and preserves original title, owner and points after issue changes', async () => {
  await session
    .post(`/api/sprints/${sprintId}/complete`)
    .set('Idempotency-Key', 'finish-once')
    .send({ version: 2 })
    .expect(201);
  await session
    .post(`/api/sprints/${sprintId}/complete`)
    .set('Idempotency-Key', 'finish-once')
    .send({ version: 2 })
    .expect(201);
  const old = (await session.get(`/api/sprints/${sprintId}/overview`).expect(200)).body as SprintOverview;
  expect(old.snapshotAt).toBeTruthy();
  expect(old.completeSnapshot).toBe(true);
  expect(old.issues).toHaveLength(4);
  const moved = (await session.get(`/api/issues/${issueId}`)).body;
  expect(moved.sprintId).toBeNull();
  await session
    .patch(`/api/issues/${issueId}`)
    .send({ version: moved.version, title: '后来修改', estimate: 100, assigneeId: null })
    .expect(200);
  expect((await session.get(`/api/sprints/${sprintId}/overview`).expect(200)).body).toEqual(old);
});
it('labels legacy completed data incomplete and denies foreign workspace access', async () => {
  const legacy = await app
    .get(Db)
    .client.sprint.create({ data: { projectId, name: '旧期', status: 'COMPLETED' } });
  expect((await session.get(`/api/sprints/${legacy.id}/overview`).expect(200)).body.completeSnapshot).toBe(
    false,
  );
  const stranger = request.agent(app.getHttpServer());
  await stranger
    .post('/api/auth/register')
    .send({
      email: `sprint-other-${Date.now()}@forge.test`,
      password: 'Testing-sprints-2026',
      name: '外部成员',
    })
    .expect(201);
  await stranger.get(`/api/sprints/${sprintId}/overview`).expect(404);
});

import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { Project, Issue, Sprint, Status, BoardData } from '../../packages/shared/src/contracts';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
let app: INestApplication;
let agent: ReturnType<typeof request.agent>;
let project: Project;
let issue: Issue;
let sprint: Sprint;
let statuses: Status[];
beforeAll(async () => {
  app = await createApp();
  // Keep one listener for this suite; Supertest must not close it between requests.
  await app.listen(0, '127.0.0.1');
  agent = request.agent(app.getHttpServer());
}, 30000);
afterAll(async () => {
  await app?.close();
});
it('registers a workspace and session, then creates defaults', async () => {
  const email = `test-${Date.now()}@forge.test`;
  await agent
    .post('/api/auth/register')
    .send({ name: '测试成员', email, password: 'Testing-strong-2026', workspaceName: '测试工作区' })
    .expect(201);
  const me = await agent.get('/api/me').expect(200);
  expect(me.body.actor.name).toBe('测试成员');
  const r = await agent
    .post('/api/projects')
    .send({ name: '测试项目', key: `T${Date.now().toString(36).toUpperCase()}` })
    .expect(201);
  project = r.body;
  const b = await agent.get(`/api/projects/${project.id}/board`).expect(200);
  statuses = b.body.statuses;
  expect(statuses).toHaveLength(7);
  expect(b.body.columns).toHaveLength(4);
  expect(
    b.body.columns[0].statuses.map(
      (mapping: { statusId: string }) => statuses.find((status) => status.id === mapping.statusId)?.name,
    ),
  ).toEqual(['Todo']);
  expect(statuses.map((status) => status.name)).toContain('Ready for Test');
  expect(statuses.map((status) => status.name)).toContain('Ready for Release');
});
it('compacts status order after deleting an unused status', async () => {
  const created = await agent
    .post('/api/projects')
    .send({ name: '状态删除验证', key: `D${Date.now().toString(36).toUpperCase()}` })
    .expect(201);
  const projectId = created.body.id;
  const initial = (await agent.get(`/api/projects/${projectId}/board`).expect(200)).body as BoardData;
  const temporary = await agent
    .post(`/api/projects/${projectId}/statuses`)
    .send({
      name: 'Temporary',
      category: 'TODO',
      columnId: initial.columns[0].id,
      version: initial.project.version,
      sortOrder: 1,
    })
    .expect(201);
  await agent.delete(`/api/projects/${projectId}/statuses/${temporary.body.id}`).expect(200);
  const board = (await agent.get(`/api/projects/${projectId}/board`).expect(200)).body as BoardData;
  expect(board.statuses.map((status) => status.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(
    board.columns[0].statuses.map(
      (mapping) => board.statuses.find((status) => status.id === mapping.statusId)?.name,
    ),
  ).toEqual(['Todo']);
});
it('creates issue once with idempotency key', async () => {
  const body = {
    type: 'STORY',
    title: '完整研发流程',
    description: '# 需求\n\n- [ ] 中文描述',
    statusId: statuses[0].id,
  };
  const r = await agent
    .post(`/api/projects/${project.id}/issues`)
    .set('Idempotency-Key', 'create-once')
    .send(body)
    .expect(201);
  issue = r.body;
  const retry = await agent
    .post(`/api/projects/${project.id}/issues`)
    .set('Idempotency-Key', 'create-once')
    .send(body)
    .expect(201);
  expect(retry.body.id).toBe(issue.id);
  await agent
    .post(`/api/projects/${project.id}/issues`)
    .set('Idempotency-Key', 'create-once')
    .send({ ...body, title: '不同请求' })
    .expect(409);
});
it('preserves version and history on conflict', async () => {
  const r = await agent
    .patch(`/api/issues/${issue.id}`)
    .send({ version: issue.version, priority: 'HIGH', estimate: 0 })
    .expect(200);
  expect(r.body.estimate).toBe(0);
  await agent
    .patch(`/api/issues/${issue.id}`)
    .send({ version: issue.version, title: '过期覆盖' })
    .expect(409);
  issue = r.body;
  const history = await agent.get(`/api/issues/${issue.id}/activities`).expect(200);
  expect(history.body.items.length).toBe(2);
});
it('enforces hierarchy and inherits sprint', async () => {
  const s = await agent.post('/api/sprints').send({ projectId: project.id, name: '第一迭代' }).expect(201);
  sprint = s.body;
  const epic = await agent
    .post(`/api/projects/${project.id}/issues`)
    .send({ type: 'EPIC', title: 'Epic' })
    .expect(201);
  await agent.patch(`/api/issues/${epic.body.id}`).send({ version: 1, sprintId: sprint.id }).expect(422);
  const u = await agent
    .patch(`/api/issues/${issue.id}`)
    .send({ version: issue.version, sprintId: sprint.id, epicId: epic.body.id })
    .expect(200);
  issue = u.body;
  const sub = await agent
    .post(`/api/projects/${project.id}/issues`)
    .send({ type: 'SUBTASK', title: '执行步骤', parentId: issue.id })
    .expect(201);
  expect(sub.body.effectiveSprintId).toBe(sprint.id);
  await agent
    .post(`/api/projects/${project.id}/issues`)
    .send({ type: 'SUBTASK', title: '非法嵌套', parentId: sub.body.id })
    .expect(422);
});
it('moves to exact multi-status section and rejects wrong column', async () => {
  const b = (await agent.get(`/api/projects/${project.id}/board`)).body;
  const target = b.statuses.find((s: Status) => s.name === 'Code Review');
  const col = b.columns.find((c: BoardData['columns'][number]) =>
    c.statuses.some((m: BoardData['columns'][number]['statuses'][number]) => m.statusId === target.id),
  );
  await agent
    .post(`/api/projects/${project.id}/board/moves`)
    .send({
      issueId: issue.id,
      targetColumnId: b.columns[0].id,
      targetStatusId: target.id,
      version: issue.version,
    })
    .expect(422);
  const r = await agent
    .post(`/api/projects/${project.id}/board/moves`)
    .send({ issueId: issue.id, targetColumnId: col.id, targetStatusId: target.id, version: issue.version })
    .expect(201);
  issue = r.body;
  expect(issue.statusId).toBe(target.id);
});
it('starts and completes sprint transactionally', async () => {
  sprint = (await agent.post(`/api/sprints/${sprint.id}/start`).send({ version: sprint.version }).expect(201))
    .body;
  await agent
    .post(`/api/sprints/${sprint.id}/complete`)
    .send({ version: sprint.version, destinationSprintId: null })
    .expect(201);
  issue = (await agent.get(`/api/issues/${issue.id}`)).body;
  expect(issue.sprintId).toBeNull();
  expect(issue.children[0].effectiveSprintId).toBeNull();
});
it('rejects actor spoofing and anonymous issue access', async () => {
  await agent
    .patch(`/api/issues/${issue.id}`)
    .send({ version: issue.version, actorId: crypto.randomUUID(), title: '伪造' })
    .expect(400);
  await request(app.getHttpServer()).get(`/api/issues/${issue.id}`).expect(401);
});

it('reorders backlog independently of Board order', async () => {
  const b = await agent
    .post(`/api/projects/${project.id}/issues`)
    .send({ type: 'TASK', title: '优先处理' })
    .expect(201);
  const initial = b.body.boardOrder;
  const moved = await agent
    .post(`/api/projects/${project.id}/backlog/moves`)
    .send({ issueId: b.body.id, version: b.body.version, targetSprintId: null, nextIssueId: issue.id })
    .expect(201);
  expect(Number(moved.body.backlogOrder)).toBeLessThan(Number(issue.backlogOrder));
  expect(moved.body.boardOrder).toBe(initial);
});

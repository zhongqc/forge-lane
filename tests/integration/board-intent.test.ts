import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import type { BoardData, Issue } from '../../packages/shared/src/contracts';
let app: INestApplication;
let agent: ReturnType<typeof request.agent>;
let board: BoardData;
let projectId: string;
beforeAll(async () => {
  app = await createApp();
  await app.init();
  agent = request.agent(app.getHttpServer());
  const tag = Date.now().toString(36).toUpperCase();
  await agent
    .post('/api/auth/register')
    .send({ email: `intent-${tag}@forge.test`, name: '列排序验证', password: 'Test-intent-2026' })
    .expect(201);
  projectId = (
    await agent
      .post('/api/projects')
      .send({ name: '状态落区验证', key: `I${tag}` })
      .expect(201)
  ).body.id;
  board = (await agent.get(`/api/projects/${projectId}/board`).expect(200)).body;
}, 30000);
afterAll(async () => {
  await app?.close();
});
const create = async (title: string, statusId: string): Promise<Issue> =>
  (await agent.post(`/api/projects/${projectId}/issues`).send({ type: 'TASK', title, statusId }).expect(201))
    .body;
it('ranks across different statuses within one column without changing status or backlog order', async () => {
  const column = board.columns[0];
  const a = await create('当前事项', column.statuses[0].statusId);
  const b = await create('相同列另一状态', column.statuses[1].statusId);
  const result = (
    await agent
      .post(`/api/projects/${projectId}/board/moves`)
      .send({
        intent: 'rank',
        issueId: a.id,
        version: a.version,
        targetColumnId: column.id,
        targetStatusId: a.statusId,
        previousIssueId: b.id,
      })
      .expect(201)
  ).body;
  expect(result.statusId).toBe(a.statusId);
  expect(Number(result.boardOrder)).toBeGreaterThan(Number(b.boardOrder));
  expect(result.backlogOrder).toBe(a.backlogOrder);
  const history = (await agent.get(`/api/issues/${a.id}/activities`).expect(200)).body.items;
  expect(history[0].payload.intent).toBe('rank');
  expect(history[0].payload.statusId).toBeUndefined();
  await agent
    .post(`/api/projects/${projectId}/board/moves`)
    .send({
      intent: 'rank',
      issueId: a.id,
      version: result.version,
      targetColumnId: column.id,
      targetStatusId: b.statusId,
    })
    .expect(422);
});
it('cross-column transition appends to the whole target column and rejects ranking coordinates', async () => {
  const from = board.columns[0],
    to = board.columns[1];
  const a = await create('跨列事项', from.statuses[0].statusId);
  const b = await create('目标首状态', to.statuses[0].statusId);
  const c = await create('目标另一状态', to.statuses[1].statusId);
  const payload = {
    intent: 'transition',
    issueId: a.id,
    version: a.version,
    targetColumnId: to.id,
    targetStatusId: b.statusId,
  };
  await agent
    .post(`/api/projects/${projectId}/board/moves`)
    .send({ ...payload, nextIssueId: c.id })
    .expect(422);
  const r = await agent
    .post(`/api/projects/${projectId}/board/moves`)
    .set('Idempotency-Key', 'transition-once')
    .send(payload)
    .expect(201);
  expect(r.body.statusId).toBe(b.statusId);
  expect(Number(r.body.boardOrder)).toBeGreaterThan(Number(c.boardOrder));
  expect(r.body.backlogOrder).toBe(a.backlogOrder);
  const replay = await agent
    .post(`/api/projects/${projectId}/board/moves`)
    .set('Idempotency-Key', 'transition-once')
    .send(payload)
    .expect(201);
  expect(replay.body.version).toBe(r.body.version);
  await agent
    .post(`/api/projects/${projectId}/board/moves`)
    .send({ ...payload, intent: 'rank', version: a.version })
    .expect(409);
});

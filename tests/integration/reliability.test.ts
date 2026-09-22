import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { installShell } from '../../apps/server/src/modules/shell/shell';
import { Db } from '../../apps/server/src/common/db';
let app: INestApplication;
let agent: ReturnType<typeof request.agent>;
let projectId: string;
let projectKey: string;
let issueId: string;
beforeAll(async () => {
  app = await createApp();
  installShell(app);
  // Keep one listener for this suite; Supertest must not close it between requests.
  await app.listen(0, '127.0.0.1');
  agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/register')
    .send({
      email: `reliability-${Date.now()}@forge.test`,
      name: '可靠性验证',
      password: 'Test-reliability-2026',
    })
    .expect(201);
  const p = await agent
    .post('/api/projects')
    .send({ name: '可靠性测试', key: `R${Date.now().toString(36).toUpperCase()}` })
    .expect(201);
  projectId = p.body.id;
  projectKey = p.body.key;
}, 30000);
afterAll(async () => {
  await app?.close();
});
it('serializes concurrent duplicate creates and rejects stale writes without partial history', async () => {
  const body = { type: 'TASK', title: '私密标题 <script>危险</script>', description: '# 初始内容' };
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      agent.post(`/api/projects/${projectId}/issues`).set('Idempotency-Key', 'concurrent-create').send(body),
    ),
  );
  expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
  expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
  issueId = results[0].body.id;
  const writes = await Promise.all(
    ['版本甲', '版本乙'].map((description) =>
      agent.patch(`/api/issues/${issueId}`).send({ version: 1, description }),
    ),
  );
  expect(writes.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
  const detail = await agent.get(`/api/issues/${issueId}`).expect(200);
  expect(detail.body.version).toBe(2);
  const revisions = await agent.get(`/api/issues/${issueId}/revisions`).expect(200);
  expect(revisions.body).toHaveLength(2);
  const activities = await agent.get(`/api/issues/${issueId}/activities`).expect(200);
  expect(activities.body.items).toHaveLength(2);
});
it('enforces one active sprint in PostgreSQL even when bypassing service validation', async () => {
  const db = app.get(Db).client;
  await db.sprint.create({ data: { projectId, name: '第一个', status: 'ACTIVE' } });
  await expect(db.sprint.create({ data: { projectId, name: '第二个', status: 'ACTIVE' } })).rejects.toThrow();
  expect(await db.sprint.count({ where: { projectId, status: 'ACTIVE' } })).toBe(1);
});
it('retries comments safely and retains immutable edited/deleted revisions', async () => {
  const path = `/api/issues/${issueId}/comments`;
  const a = await agent
    .post(path)
    .set('Idempotency-Key', 'comment-once')
    .send({ content: '最初评论' })
    .expect(201);
  const b = await agent
    .post(path)
    .set('Idempotency-Key', 'comment-once')
    .send({ content: '最初评论' })
    .expect(201);
  expect(b.body.id).toBe(a.body.id);
  await agent.patch(`${path}/${a.body.id}`).send({ content: '修改评论', version: 1 }).expect(200);
  await agent.delete(`${path}/${a.body.id}`).send({ content: '删除', version: 2 }).expect(200);
  const rows = await agent.get(path).expect(200);
  expect(rows.body).toHaveLength(1);
  expect(rows.body[0].deletedAt).toBeTruthy();
  expect(
    await app.get(Db).client.commentRevision.count({ where: { commentId: a.body.id } }),
  ).toBeGreaterThanOrEqual(2);
});
it('serves private escaped metadata only to authorized sessions and never falls back unknown API to HTML', async () => {
  const path = `/issues/${projectKey}-1`;
  const anon = await request(app.getHttpServer()).get(path).expect(200);
  expect(anon.text).toContain('<title>Forge Lane');
  expect(anon.text).not.toContain('私密标题');
  expect(anon.headers.location).toBeUndefined();
  const own = await agent.get(path).expect(200);
  expect(own.text).toContain('私密标题 &lt;script&gt;危险&lt;/script&gt;');
  expect(own.headers['cache-control']).toContain('no-store');
  await agent.get('/api/not-a-route').expect(404).expect('Content-Type', /json/);
});
it('rejects missing required issue fields and publishes actionable command schemas', async () => {
  await agent.post(`/api/projects/${projectId}/issues`).send({ type: 'TASK' }).expect(400);
  await agent.post(`/api/projects/${projectId}/issues`).send({ title: '没有类型' }).expect(400);
  const doc = await agent.get('/api/docs-json').expect(200);
  expect(doc.body.components.schemas.CreateIssueDto.required).toContain('title');
  expect(doc.body.components.schemas.MoveIssueDto.properties.version.type).toBe('number');
});
it('versions workflow changes, snapshots labels and protects used statuses', async () => {
  const board = (await agent.get(`/api/projects/${projectId}/board`)).body;
  const first = board.statuses[0];
  const columnId = board.columns[0].id;
  const change = {
    name: 'Ready for Review',
    category: 'TODO',
    columnId,
    version: board.project.version,
    sortOrder: 1,
  };
  await agent.patch(`/api/projects/${projectId}/statuses/${first.id}`).send(change).expect(200);
  await agent.patch(`/api/projects/${projectId}/statuses/${first.id}`).send(change).expect(409);
  await agent.delete(`/api/projects/${projectId}/statuses/${first.id}`).expect(422);
  const next = (await agent.get(`/api/projects/${projectId}/board`)).body;
  expect(next.statuses[1].name).toBe('Ready for Review');
});

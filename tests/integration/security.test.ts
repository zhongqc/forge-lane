import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
let app: INestApplication;
let admin: ReturnType<typeof request.agent>;
let viewer: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;
let projectId: string;
let workspaceId: string;
let issueId: string;
let viewerEmail: string;
beforeAll(async () => {
  app = await createApp();
  await app.init();
  admin = request.agent(app.getHttpServer());
  viewer = request.agent(app.getHttpServer());
  outsider = request.agent(app.getHttpServer());
  const tag = Date.now();
  viewerEmail = `viewer-${tag}@forge.test`;
  for (const [a, email] of [
    [admin, `admin-${tag}@forge.test`],
    [viewer, viewerEmail],
    [outsider, `outsider-${tag}@forge.test`],
  ] as const)
    await a
      .post('/api/auth/register')
      .send({ email, password: 'Secure-test-password', name: '成员' })
      .expect(201);
  workspaceId = (await admin.get('/api/me')).body.workspace.id;
  projectId = (
    await admin.post('/api/projects').send({ name: '私有项目', key: `S${tag.toString(36).toUpperCase()}` })
  ).body.id;
  issueId = (await admin.post(`/api/projects/${projectId}/issues`).send({ type: 'TASK', title: '私有数据' }))
    .body.id;
});
afterAll(async () => {
  await app?.close();
});
it('allows admin to add registered members and viewer can switch workspace', async () => {
  const m = await admin
    .post('/api/workspace/members')
    .send({ email: viewerEmail, role: 'VIEWER' })
    .expect(201);
  await admin
    .post(`/api/projects/${projectId}/members`)
    .send({ actorId: m.body.actorId, role: 'VIEWER' })
    .expect(201);
  await viewer.post('/api/workspaces/select').send({ workspaceId }).expect(201);
  await viewer.get(`/api/issues/${issueId}`).expect(200);
  await viewer.patch(`/api/issues/${issueId}`).send({ version: 1, title: '非法写入' }).expect(403);
});
it('cross-workspace issue and preview data cannot be read', async () => {
  await outsider.get(`/api/issues/${issueId}`).expect(404);
  await outsider.get(`/api/projects/${projectId}/board`).expect(404);
});
it('rejects null for non-nullable fields and leaves history unchanged', async () => {
  for (const field of ['title', 'type', 'statusId', 'description', 'priority'])
    await admin
      .patch(`/api/issues/${issueId}`)
      .send({ version: 1, [field]: null })
      .expect(400);
  const r = await admin.get(`/api/issues/${issueId}`);
  expect(r.body.title).toBe('私有数据');
  expect(r.body.version).toBe(1);
});
it('rejects cross-site writes', async () => {
  await admin
    .patch(`/api/issues/${issueId}`)
    .set('Origin', 'https://evil.example')
    .send({ version: 1, title: '篡改' })
    .expect(403);
});

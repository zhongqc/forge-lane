import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { Db } from '../../apps/server/src/common/db';
import { EmailChannel } from '../../apps/server/src/modules/notification/notification-channel';
import { NotificationWorker } from '../../apps/server/src/modules/notification/notification.worker';
import { mentionIds } from '../../apps/server/src/modules/notification/mention-parser';

let app: INestApplication, db: Db;
let sender: ReturnType<typeof request.agent>,
  recipient: ReturnType<typeof request.agent>,
  outsider: ReturnType<typeof request.agent>;
let projectId: string, workspaceId: string, recipientId: string, senderId: string, outsiderId: string;
let issueId: string;
const send = vi.fn(async () => {});
const link = (id: string) => `[@任意显示名](/mentions/${id})`;
const createdIssues: string[] = [];
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  db = app.get(Db);
  const email = app.get(EmailChannel);
  vi.spyOn(email, 'configured').mockReturnValue(true);
  vi.spyOn(email, 'send').mockImplementation(send);
  [sender, recipient, outsider] = [0, 1, 2].map(() => request.agent(app.getHttpServer()));
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  for (const [index, agent] of [sender, recipient, outsider].entries()) {
    await agent
      .post('/api/auth/register')
      .send({
        email: `mention-${index}-${tag}@forge.test`,
        password: 'Secure-test-password',
        name: `成员${index}`,
      })
      .expect(201);
  }
  const owner = (await sender.get('/api/me')).body;
  workspaceId = owner.workspace.id;
  senderId = owner.actor.id;
  recipientId = (await recipient.get('/api/me')).body.actor.id;
  outsiderId = (await outsider.get('/api/me')).body.actor.id;
  projectId = (
    await sender
      .post('/api/projects')
      .send({ name: '提及测试', key: `M${Date.now().toString(36).toUpperCase()}` })
  ).body.id;
  await sender
    .post('/api/workspace/members')
    .send({ email: `mention-1-${tag}@forge.test`, role: 'MEMBER' })
    .expect(201);
  await sender
    .post(`/api/projects/${projectId}/members`)
    .send({ actorId: recipientId, role: 'MEMBER' })
    .expect(201);
  await recipient.post('/api/workspaces/select').send({ workspaceId }).expect(201);
  // A mocked worker must never consume deliveries belonging to real users or other suites.
  const jobs = db.client.notificationDelivery;
  const findJobs = jobs.findMany.bind(jobs);
  const updateJobs = jobs.updateMany.bind(jobs);
  vi.spyOn(jobs, 'findMany').mockImplementation((args) =>
    findJobs({ ...args, where: { AND: [args?.where ?? {}, { notification: { issue: { projectId } } }] } }),
  );
  vi.spyOn(jobs, 'updateMany').mockImplementation((args) =>
    updateJobs({ ...args, where: { AND: [args.where ?? {}, { notification: { issue: { projectId } } }] } }),
  );

  // Worker scans are scoped to this suite, including exhausted-lease cleanup.
  const findMany = db.client.notificationDelivery.findMany.bind(db.client.notificationDelivery);
  const updateMany = db.client.notificationDelivery.updateMany.bind(db.client.notificationDelivery);
  vi.spyOn(db.client.notificationDelivery, 'findMany').mockImplementation((args) =>
    findMany({
      ...args,
      where: { AND: [args?.where ?? {}, { notification: { issue: { projectId } } }] },
    }),
  );
  vi.spyOn(db.client.notificationDelivery, 'updateMany').mockImplementation((args) =>
    updateMany({
      ...args,
      where: { AND: [args?.where ?? {}, { notification: { issue: { projectId } } }] },
    }),
  );
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (db && createdIssues.length) await db.client.issue.deleteMany({ where: { id: { in: createdIssues } } });
  await app?.close();
});
async function create(description = link(recipientId), key?: string) {
  const req = sender.post(`/api/projects/${projectId}/issues`);
  if (key) req.set('Idempotency-Key', key);
  const response = await req.send({ type: 'TASK', title: '测试提及', description }).expect(201);
  createdIssues.push(response.body.id);
  return response.body;
}
it('parses Markdown structurally, deduplicates and rejects code, HTML and invalid destinations', () => {
  const text = `${link(recipientId)} ${link(recipientId)}\n\n\`${link(outsiderId)}\`\n\n~~~md\n${link(senderId)}\n~~~\n\n<a href="/mentions/${outsiderId}">@x</a>\n\n[x](https://evil.test/mentions/${outsiderId}) [x](/mentions/not-uuid)`;
  expect([...mentionIds(text)]).toEqual([recipientId]);
});
it('scopes member candidates and does not trust display names, self, outsiders or code', async () => {
  const members = (await sender.get(`/api/projects/${projectId}/mention-members`).expect(200)).body;
  expect(members.map((m: { id: string }) => m.id).sort()).toEqual([recipientId, senderId].sort());
  await outsider.get(`/api/projects/${projectId}/mention-members`).expect(404);
  const issue = await create(
    `${link(recipientId)} ${link(recipientId)} ${link(senderId)} ${link(outsiderId)} \`${link(outsiderId)}\``,
    'mention-create-once',
  );
  issueId = issue.id;
  const rows = await db.client.mentionNotification.findMany({ where: { issueId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]!.recipientId).toBe(recipientId);
  await create(issue.description, 'mention-create-once');
  expect(await db.client.mentionNotification.count({ where: { issueId } })).toBe(1);
});
it('description diff cancels removed mentions and re-adds; conflict and unchanged mention produce no extra event', async () => {
  await sender
    .patch(`/api/issues/${issueId}`)
    .send({ version: 1, description: link(recipientId) + ' changed' })
    .expect(200);
  await sender.patch(`/api/issues/${issueId}`).send({ version: 1, description: '' }).expect(409);
  expect(await db.client.mentionNotification.count({ where: { issueId } })).toBe(1);
  await sender.patch(`/api/issues/${issueId}`).send({ version: 2, description: '' }).expect(200);
  expect(
    (await db.client.notificationDelivery.findFirstOrThrow({ where: { notification: { issueId } } })).status,
  ).toBe('CANCELLED');
  await sender
    .patch(`/api/issues/${issueId}`)
    .send({ version: 3, description: link(recipientId) })
    .expect(200);
  expect(await db.client.mentionNotification.count({ where: { issueId } })).toBe(2);
});
it('comment create/edit/delete and replay produce incremental notifications and cancellation', async () => {
  const path = `/api/issues/${issueId}/comments`;
  const body = { content: link(recipientId) };
  const comment = (await sender.post(path).set('Idempotency-Key', 'comment-once').send(body).expect(201))
    .body;
  await sender.post(path).set('Idempotency-Key', 'comment-once').send(body).expect(201);
  expect(await db.client.mentionNotification.count({ where: { commentId: comment.id } })).toBe(1);
  await sender
    .patch(`${path}/${comment.id}`)
    .send({ version: 1, content: '' + 'removed' })
    .expect(200);
  await sender
    .patch(`${path}/${comment.id}`)
    .send({ version: 2, content: link(recipientId) })
    .expect(200);
  await sender.delete(`${path}/${comment.id}`).send({ version: 3, content: '删除' }).expect(200);
  expect(
    await db.client.mentionNotification.count({ where: { commentId: comment.id, cancelledAt: null } }),
  ).toBe(0);
  expect(
    await db.client.notificationDelivery.count({
      where: { notification: { commentId: comment.id }, status: 'CANCELLED' },
    }),
  ).toBe(2);
});
it('inbox only exposes own accessible events, preserves cursor across cancellation and marks read', async () => {
  const inbox = (await recipient.get('/api/notifications').expect(200)).body;
  expect(inbox.unreadCount).toBe(1);
  expect(inbox.items[0]).toMatchObject({ source: 'DESCRIPTION', senderName: '成员0', commentId: null });
  await sender.post(`/api/notifications/${inbox.items[0].id}/read`).expect(404);
  await recipient.post(`/api/notifications/${inbox.items[0].id}/read`).expect(201);
  expect((await recipient.get('/api/notifications')).body.unreadCount).toBe(0);
  await sender.patch(`/api/issues/${issueId}`).send({ version: 4, description: '' }).expect(200);
  await recipient.get(`/api/notifications?cursor=${inbox.items[0].id}`).expect(200);
  await recipient.post('/api/notifications/read-all').expect(201);
});
it('unconfigured email is skipped permanently while inbox survives', async () => {
  const channel = app.get(EmailChannel);
  vi.spyOn(channel, 'configured').mockReturnValue(false);
  const issue = await create();
  expect(
    (
      await db.client.notificationDelivery.findFirstOrThrow({
        where: { notification: { issueId: issue.id } },
      })
    ).status,
  ).toBe('SKIPPED');
  expect(
    (await recipient.get('/api/notifications')).body.items.some(
      (n: { issueKey: string }) => n.issueKey === issue.key,
    ),
  ).toBe(true);
  vi.spyOn(channel, 'configured').mockReturnValue(true);
});
it('worker leases prevent concurrent sends, sends minimal content and uses a stable message identity', async () => {
  const issue = await create(link(recipientId) + ' SECRET_BODY');
  send.mockClear();
  const workerA = new NotificationWorker(db, app.get(EmailChannel));
  const workerB = new NotificationWorker(db, app.get(EmailChannel));
  await Promise.all([workerA.tick(), workerB.tick()]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(send.mock.calls)).not.toContain('SECRET_BODY');
  expect(send.mock.calls[0]).toBeDefined();
  expect(
    (
      await db.client.notificationDelivery.findFirstOrThrow({
        where: { notification: { issueId: issue.id } },
      })
    ).status,
  ).toBe('SENT');
});
it('retries sanitized failures, recovers expired leases and permanently stops exhausted attempts', async () => {
  const issue = await create();
  const worker = new NotificationWorker(db, app.get(EmailChannel));
  send.mockRejectedValueOnce(new Error('smtp password=secret@example.test'));
  await worker.tick();
  const job = await db.client.notificationDelivery.findFirstOrThrow({
    where: { notification: { issueId: issue.id } },
  });
  expect(job.status).toBe('PENDING');
  expect(job.attempts).toBe(1);
  expect(job.lastError).toBe('EMAIL_DELIVERY_FAILED');
  await db.client.notificationDelivery.update({
    where: { id: job.id },
    data: { status: 'SENDING', leaseToken: 'dead-worker', leaseUntil: new Date(0), retryAt: new Date(0) },
  });
  await worker.tick();
  expect((await db.client.notificationDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
    'SENT',
  );
  await db.client.notificationDelivery.update({
    where: { id: job.id },
    data: { status: 'SENDING', attempts: 5, leaseUntil: new Date(0), retryAt: new Date(0) },
  });
  send.mockClear();
  await worker.tick();
  expect(send).not.toHaveBeenCalled();
  expect((await db.client.notificationDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
    'FAILED',
  );
});
it('removed project access hides inbox and cancels pending delivery; inactive actors excluded', async () => {
  const issue = await create();
  await db.client.projectMember.delete({ where: { projectId_actorId: { projectId, actorId: recipientId } } });
  expect((await recipient.get('/api/notifications').expect(200)).body.items).toEqual([]);
  send.mockClear();
  await new NotificationWorker(db, app.get(EmailChannel)).tick();
  expect(send).not.toHaveBeenCalled();
  expect(
    (
      await db.client.notificationDelivery.findFirstOrThrow({
        where: { notification: { issueId: issue.id } },
      })
    ).status,
  ).toBe('CANCELLED');
  expect(
    (await sender.get(`/api/projects/${projectId}/mention-members`)).body.map((a: { id: string }) => a.id),
  ).toEqual([senderId]);
});

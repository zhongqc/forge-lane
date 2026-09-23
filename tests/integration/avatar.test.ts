import { beforeAll, afterAll, expect, it, vi, type MockInstance } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { OssService } from '../../apps/server/src/modules/storage/oss.service';
let app: INestApplication;
let owner: ReturnType<typeof request.agent>;
let other: ReturnType<typeof request.agent>;
let image: Buffer;
let actorId: string;
let savedKey: string;
let stored: Buffer;
let putMock: MockInstance<OssService['put']>;
let getMock: MockInstance<OssService['get']>;
let deleteMock: MockInstance<OssService['delete']>;
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  owner = request.agent(app.getHttpServer());
  other = request.agent(app.getHttpServer());
  for (const [agent, suffix] of [
    [owner, 'owner'],
    [other, 'other'],
  ] as const) {
    await agent
      .post('/api/auth/register')
      .send({
        email: `avatar-${suffix}-${Date.now()}@forge.test`,
        password: 'Avatar-test-2026',
        name: suffix,
      })
      .expect(201);
  }
  actorId = (await owner.get('/api/me')).body.actor.id;
  image = await sharp({ create: { width: 480, height: 320, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
  putMock = vi.spyOn(app.get(OssService), 'put').mockImplementation(async (key, data) => {
    savedKey = key;
    stored = data;
  });
  getMock = vi.spyOn(app.get(OssService), 'get').mockImplementation(async () => stored);
  deleteMock = vi.spyOn(app.get(OssService), 'delete').mockResolvedValue(undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
it('stores a normalized avatar in its actor folder and exposes it through authenticated reads', async () => {
  await request(app.getHttpServer()).post('/api/me/avatar').attach('file', image, 'avatar.png').expect(401);
  const result = await owner.post('/api/me/avatar').attach('file', image, 'avatar.png').expect(201);
  expect(savedKey).toMatch(new RegExp(`^avatars/${actorId}/[a-f0-9-]+\\.webp$`));
  expect(result.body.avatarKey).toBe(savedKey);
  const metadata = await sharp(stored).metadata();
  expect(metadata).toMatchObject({ width: 256, height: 256, format: 'webp' });
  expect((await owner.get('/api/me')).body.actor.avatarKey).toBe(savedKey);
  await owner
    .get(`/api/actors/${actorId}/avatar`)
    .expect('Content-Type', /image\/webp/)
    .expect(200);
  const versioned = `/api/actors/${actorId}/avatar?v=${encodeURIComponent(savedKey)}`;
  const cached = await owner.get(versioned).expect(200);
  expect(cached.headers['cache-control']).toBe('private, max-age=86400, immutable');
  expect(cached.headers.vary).toContain('Cookie');
  await owner.get(versioned).set('If-None-Match', cached.headers.etag).expect(304);
  expect(getMock).toHaveBeenCalledTimes(1);
  await other.get(versioned).set('If-None-Match', cached.headers.etag).expect(404);
  await other.get(`/api/actors/${actorId}/avatar`).expect(404);
  await request(app.getHttpServer()).get(`/api/actors/${actorId}/avatar`).expect(401);
});
it('rejects invalid and oversized files without replacing the current avatar', async () => {
  await owner.post('/api/me/avatar').attach('file', Buffer.from('<svg></svg>'), 'avatar.png').expect(422);
  await owner
    .post('/api/me/avatar')
    .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'large.png')
    .expect(413);
  expect((await owner.get('/api/me')).body.actor.avatarKey).toBe(savedKey);
});
it('keeps the previous avatar when OSS fails and deletes the previous object after replacement', async () => {
  const previousKey = savedKey;
  putMock.mockRejectedValueOnce(new Error('offline'));
  await owner.post('/api/me/avatar').attach('file', image, 'avatar.png').expect(500);
  expect((await owner.get('/api/me')).body.actor.avatarKey).toBe(previousKey);
  expect(deleteMock).not.toHaveBeenCalled();
  await owner.post('/api/me/avatar').attach('file', image, 'avatar.png').expect(201);
  expect(savedKey).not.toBe(previousKey);
  await owner.get(`/api/actors/${actorId}/avatar?v=${encodeURIComponent(previousKey)}`).expect(404);
  await owner.get(`/api/actors/${actorId}/avatar?v=${encodeURIComponent(savedKey)}`).expect(200);
  expect(getMock).toHaveBeenCalledTimes(2);
  expect(deleteMock).toHaveBeenCalledWith(previousKey);
});

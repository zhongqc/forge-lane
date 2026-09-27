import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';
import { APP_VERSION } from '../../packages/shared/src/version';

let app: INestApplication;

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await app?.close();
});

it('exposes the current application version without a session', async () => {
  const response = await request(app.getHttpServer()).get('/api/version').expect(200);
  expect(response.body).toEqual({ version: APP_VERSION });
});

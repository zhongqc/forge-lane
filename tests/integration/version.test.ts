import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/server/src/app';

let app: INestApplication;

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await app?.close();
});

it('PT-6: serves the server package version without authentication', async () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../apps/server/package.json', import.meta.url), 'utf8'),
  );
  expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);

  const response = await request(app.getHttpServer()).get('/api/version').expect(200);
  expect(response.body).toEqual({ version: packageJson.version });
});

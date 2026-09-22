import { test, expect } from '@playwright/test';
import { createDatabase } from '../../packages/db/src/client';
test('500 issue board renders, remains interactive and persists a move', async ({ page }, info) => {
  test.setTimeout(60000);
  const tag = Date.now().toString(36).toUpperCase();
  await page.request.post('/api/auth/register', {
    data: { email: `perf-${tag}@forge.test`, password: 'Performance-test-2026', name: '性能验证' },
  });
  const me = await (await page.request.get('/api/me')).json();
  const project = await (
    await page.request.post('/api/projects', { data: { name: '500 事项基准', key: `P${tag}` } })
  ).json();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const db = createDatabase();
  try {
    await db.issue.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        projectId: project.id,
        number: i + 1,
        type: 'TASK' as const,
        title: `性能事项 ${i + 1}`,
        reporterId: me.actor.id,
        statusId: board.statuses[i % 8].id,
        boardOrder: (i + 1) * 1024,
        backlogOrder: (i + 1) * 1024,
      })),
    });
    await db.project.update({ where: { id: project.id }, data: { issueCounter: 500 } });
  } finally {
    await db.$disconnect();
  }
  const apiTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const r = await page.request.get(`/api/projects/${project.id}/board`);
    expect(r.ok()).toBeTruthy();
    apiTimes.push(Date.now() - start);
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const start = Date.now();
  await page.goto(`/projects/${project.key}/board`);
  await expect(page.locator('.issue-card')).toHaveCount(500);
  const renderMs = Date.now() - start;
  await expect(page.getByRole('button', { name: '性能事项 1', exact: true })).toBeVisible();
  const handle = page.getByRole('button', { name: `拖动 ${project.key}-1`, exact: true });
  const target = page.getByRole('region', { name: '开发中', exact: true });
  const a = await handle.boundingBox();
  if (!a) throw new Error('Drag bounds missing');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 5, { steps: 5 });
  const b = await page.getByRole('region', { name: '移至 In Progress', exact: true }).boundingBox();
  if (!b) throw new Error('Drop bounds missing');
  const move = page.waitForResponse(
    (r) => r.url().endsWith('/board/moves') && r.request().method() === 'POST',
  );
  const dragStart = Date.now();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  expect((await move).ok()).toBeTruthy();
  const dragMs = Date.now() - dragStart;
  await expect(target.getByRole('button', { name: '性能事项 1', exact: true })).toHaveCount(1);
  const sourceColumn = page.locator('.column-scroll').first();
  const sourceCard = sourceColumn.locator('.issue-card').first();
  const sourceBounds = await sourceCard.boundingBox();
  const columnBounds = await sourceColumn.boundingBox();
  if (!sourceBounds || !columnBounds) throw new Error('Scroll bounds missing');
  await page.mouse.move(sourceBounds.x + 45, sourceBounds.y + 45);
  await page.mouse.down();
  await page.mouse.move(columnBounds.x + 60, columnBounds.y + columnBounds.height - 20, { steps: 15 });
  await expect.poll(() => sourceColumn.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  expect(errors).toEqual([]);
  await info.attach('500-issue-metrics', {
    body: JSON.stringify({ apiMs: apiTimes, renderMs, dragIncludingRequestMs: dragMs }, null, 2),
    contentType: 'application/json',
  });
  console.log(JSON.stringify({ apiMs: apiTimes, renderMs, dragIncludingRequestMs: dragMs }));
  await page.screenshot({ path: info.outputPath('500-issue-board.png') });
});

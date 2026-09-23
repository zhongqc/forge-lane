import { register } from './support/register';
import { test, expect } from '@playwright/test';
test('current sprint shows member points and history preserves rollover snapshot', async ({ page }, info) => {
  test.setTimeout(90000);
  const tag = Date.now().toString(36).toUpperCase();
  await register(page.request, {
    email: `sprint-ui-${tag}@forge.test`,
    password: 'Sprint-browser-2026',
    name: '迭代成员',
  });
  const me = await (await page.request.get('/api/me')).json();
  const project = await (
    await page.request.post('/api/projects', { data: { name: 'Sprint 浏览器验收', key: `H${tag}` } })
  ).json();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const done = board.statuses.find((s: { category: string }) => s.category === 'DONE');
  const sprint = await (
    await page.request.post('/api/sprints', {
      data: { projectId: project.id, name: '验收 Sprint', goal: '保留历史分配' },
    })
  ).json();
  await page.request.post(`/api/sprints/${sprint.id}/start`, { data: { version: 1 } });
  const unfinished = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: {
        type: 'STORY',
        title: '未完成但应保留历史',
        sprintId: sprint.id,
        estimate: 3,
        assigneeId: me.actor.id,
      },
    })
  ).json();
  await page.request.post(`/api/projects/${project.id}/issues`, {
    data: {
      type: 'TASK',
      title: '已经完成',
      sprintId: sprint.id,
      estimate: 2,
      assigneeId: me.actor.id,
      statusId: done.id,
    },
  });
  await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'BUG', title: '未分配未估点', sprintId: sprint.id },
  });
  await page.goto(`/projects/${project.key}/board`);
  const pointsButton = page
    .locator('.board-toolbar')
    .getByRole('button', { name: '成员 Story Points', exact: true });
  await expect(pointsButton).toBeVisible();
  await expect(page.locator('.sprint-points-panel')).toHaveCount(0);
  await pointsButton.click();
  const pointsDrawer = page.getByRole('dialog', { name: '成员 Story Points', exact: true });
  await expect(pointsDrawer).toContainText('验收 Sprint');
  const table = page.getByRole('table', { name: '成员 Story Point 统计' });
  await expect(table.getByRole('row').filter({ hasText: '迭代成员' })).toContainText('5');
  await expect(table.getByRole('row').filter({ hasText: '未分配' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('current-sprint-points.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(pointsDrawer).not.toBeVisible();
  await expect(pointsButton).toBeFocused();
  await pointsButton.click();
  await page.getByRole('button', { name: '关闭成员统计', exact: true }).click();
  await expect(pointsDrawer).not.toBeVisible();
  expect(
    (await page.request.post(`/api/sprints/${sprint.id}/complete`, { data: { version: 2 } })).ok(),
  ).toBeTruthy();
  const moved = await (await page.request.get(`/api/issues/${unfinished.id}`)).json();
  await page.request.patch(`/api/issues/${unfinished.id}`, {
    data: { version: moved.version, title: '现在的新标题', estimate: 99 },
  });
  await page.goto(`/projects/${project.key}/backlog`);
  await page.getByRole('button', { name: '历史 Sprint', exact: true }).click();
  const history = page.getByRole('dialog', { name: '历史 Sprint' });
  await expect(history).toContainText('结束时快照');
  await expect(history).toContainText('未完成但应保留历史');
  await expect(history).not.toContainText('现在的新标题');
  await expect(history.getByRole('table').getByRole('row').filter({ hasText: '迭代成员' })).toContainText(
    '5',
  );
  await page.screenshot({ path: info.outputPath('sprint-history.png') });
});

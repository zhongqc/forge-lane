import { test, expect, type Page } from '@playwright/test';
import { register } from './support/register';

async function projectPage(page: Page) {
  const suffix = Date.now().toString(36).toUpperCase();
  await register(page.request, {
    email: `board-${suffix}@forge.test`,
    password: 'Test-board-password-2026',
    name: '看板测试',
  });
  const response = await page.request.post('/api/projects', {
    data: { name: '看板回归', key: `B${suffix}` },
  });
  expect(response.status()).toBe(201);
  const project = await response.json();
  await page.goto(`/projects/${project.key}/board`);
  return project;
}

test('board heading follows the cards shown after filtering', async ({ page }) => {
  const project = await projectPage(page);
  for (const type of ['TASK', 'BUG']) {
    const response = await page.request.post(`/api/projects/${project.id}/issues`, {
      data: { type, title: `${type} item` },
    });
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await expect(page.locator('.board-columns .issue-card')).toHaveCount(2);
  await page.locator('.board-toolbar').getByRole('button', { name: 'Bug' }).click();
  await expect(page.locator('.board-columns .issue-card')).toHaveCount(1);
  await expect(page.locator('.page-heading h1')).toHaveText('看板 1');
});

test('new task can set priority and zero story points before creation', async ({ page }) => {
  const project = await projectPage(page);
  await page.locator('.topbar').getByRole('button', { name: '创建事项', exact: true }).click();
  await page.getByPlaceholder('需要完成什么？').fill('创建时规划');
  await page.getByRole('button', { name: '优先级', exact: true }).click();
  await page.getByRole('listbox', { name: '优先级' }).getByRole('option', { name: /高/ }).click();
  await page.getByRole('spinbutton', { name: 'Story Points' }).fill('0');
  await page.getByRole('button', { name: '创建事项', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '创建时规划' })).toBeVisible();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const issue = board.issues.find((item: { title: string }) => item.title === '创建时规划');
  expect(issue?.priority).toBe('HIGH');
  expect(issue?.estimate).toBe(0);
});

test('board and backlog labels fit at common desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await projectPage(page);
  const epic = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: { type: 'EPIC', title: 'Improve collaboration' },
    })
  ).json();
  await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'TASK', title: 'Readable labels', epicId: epic.id, priority: 'HIGH', estimate: 3 },
  });
  await page.reload();
  const card = page.locator('.board-columns .issue-card').first();
  await expect(card.locator('.card-status')).toBeVisible();
  await expect(card.locator('.card-epic span')).toBeVisible();
  const cardBox = await card.boundingBox();
  const epicBox = await card.locator('.card-epic span').boundingBox();
  expect(cardBox && epicBox && epicBox.x + epicBox.width <= cardBox.x + cardBox.width).toBeTruthy();
  await page.screenshot({ path: '/tmp/forge-board-1280.png', fullPage: true });
  await page.goto(`/projects/${project.key}/backlog`);
  await expect(page.locator('.backlog-row').first()).toBeVisible();
  await page.screenshot({ path: '/tmp/forge-backlog-1280.png', fullPage: true });
});

test('web offers the CLI binary for the selected platform', async ({ page }) => {
  await page.route('**/downloads/manifest.json', (route) =>
    route.fulfill({
      json: {
        version: '0.1.0',
        files: [
          {
            target: 'bun-darwin-arm64',
            label: 'macOS · Apple Silicon',
            name: 'forge-macos-arm64.zip',
            executable: 'forge-macos-arm64',
            size: 123,
            sha256: 'a'.repeat(64),
          },
        ],
      },
    }),
  );
  await projectPage(page);
  await expect(page.getByRole('button', { name: '下载 CLI' })).toBeVisible();
  await page.getByRole('button', { name: '下载 CLI' }).click();
  const dialog = page.getByRole('dialog', { name: '下载 Forge CLI' });
  await expect(dialog.getByRole('link', { name: /macOS · Apple Silicon/ })).toHaveAttribute(
    'href',
    '/downloads/forge-macos-arm64.zip',
  );
  await expect(dialog).toContainText('0.1.0');
  await expect(dialog).toContainText('a'.repeat(64));
  await page.getByRole('button', { name: '关闭' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: '下载 CLI' });
  const bounds = await trigger.boundingBox();
  expect(bounds && bounds.x + bounds.width <= 390).toBeTruthy();
});

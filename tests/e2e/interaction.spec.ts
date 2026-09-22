import { test, expect, type Page } from '@playwright/test';
async function fixture(page: Page) {
  const tag = Date.now().toString(36).toUpperCase();
  await page.request.post('/api/auth/register', {
    data: { email: `qa-${tag}@forge.test`, password: 'Test-experience-2026', name: '体验成员' },
  });
  const project = await (
    await page.request.post('/api/projects', { data: { name: '交互验证', key: `Q${tag}` } })
  ).json();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const issue = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: {
        type: 'STORY',
        title: '验证交互可靠性',
        description:
          '## 验收标准\n\n- [ ] 中文清单\n  - 嵌套内容\n\n```typescript\nconst answer = 42;\n```\n\n[参考](https://example.com)',
      },
    })
  ).json();
  await page.goto(`/projects/${project.key}/board`);
  await expect(page.getByRole('button', { name: '验证交互可靠性', exact: true })).toBeVisible();
  return { project, board, issue };
}
test('precise empty section drop submits one move and reload persists', async ({ page }) => {
  const { issue } = await fixture(page);
  let count = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) count++;
  });
  const handle = page.getByRole('button', { name: `拖动 ${issue.key}` });
  const drop = page.getByRole('region', { name: 'Code Review', exact: true });
  const a = await handle.boundingBox();
  const b = await drop.boundingBox();
  if (!a || !b) throw new Error('Drop geometry missing');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(drop.getByRole('button', { name: '验证交互可靠性', exact: true })).toBeVisible();
  await expect.poll(() => count).toBe(1);
  await page.reload();
  await expect(drop.getByRole('button', { name: '验证交互可靠性', exact: true })).toBeVisible();
});
test('description conflict keeps local draft and roundtrip preserves Markdown constructs', async ({
  page,
}) => {
  const { issue } = await fixture(page);
  await page.getByRole('button', { name: '验证交互可靠性', exact: true }).click();
  await page.getByRole('button', { name: '编辑描述', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'editable markdown', exact: true });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+End');
  await editor.press('Enter');
  await editor.pressSequentially('本地追加');
  await page.request.patch(`/api/issues/${issue.id}`, {
    data: { version: issue.version, description: '来自另一位成员的新描述' },
  });
  await page.getByRole('button', { name: '保存描述', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '描述有新版本' })).toContainText('本地追加');
  await page.getByRole('button', { name: '保留我的内容并保存' }).click();
  await expect(page.getByRole('dialog', { name: '描述有新版本' })).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(/本地追加/)).toBeVisible();
  const saved = await (await page.request.get(`/api/issues/${issue.id}`)).json();
  expect(saved.description).toContain('const answer = 42');
  expect(saved.description).toContain('https://example.com');
  expect(saved.description).toContain('中文清单');
  expect(saved.description).toContain('嵌套内容');
});
test('slash commands insert a checklist', async ({ page }) => {
  const { issue } = await fixture(page);
  await page.request.patch(`/api/issues/${issue.id}`, { data: { version: 1, description: '' } });
  await page.getByRole('button', { name: '验证交互可靠性', exact: true }).click();
  await page.getByRole('button', { name: '编辑描述', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'editable markdown', exact: true });
  await editor.click();
  await editor.press('/');
  await expect(page.getByRole('menu', { name: '插入内容' })).toBeVisible();
  await page.getByRole('menuitem', { name: '任务清单' }).click();
  await page.getByRole('button', { name: '保存描述', exact: true }).click();
  await expect(page.getByText('待完成事项', { exact: true })).toBeVisible();
});
test('backlog supports moving to an empty sprint', async ({ page }) => {
  const { project, issue } = await fixture(page);
  const sprint = await (
    await page.request.post('/api/sprints', { data: { projectId: project.id, name: '下一迭代' } })
  ).json();
  await page.goto(`/projects/${project.key}/backlog`);
  const handle = page.getByRole('button', { name: `规划 ${issue.key}` });
  const target = page.getByRole('region', { name: '下一迭代' });
  const a = await handle.boundingBox(),
    b = await target.boundingBox();
  if (!a || !b) throw new Error('Drop geometry missing');
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () => (await (await page.request.get(`/api/issues/${issue.id}`)).json()).sprintId)
    .toBe(sprint.id);
  await page.reload();
  await expect(target).toContainText('验证交互可靠性');
});
test('closing a dirty description preserves the draft until explicitly discarded', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: '验证交互可靠性', exact: true }).click();
  await page.getByRole('button', { name: '编辑描述', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'editable markdown', exact: true });
  await editor.press('ControlOrMeta+Home');
  await editor.pressSequentially('尚未提交的草稿');
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '描述尚未保存' })).toBeVisible();
  await page.getByRole('button', { name: '保留草稿并关闭', exact: true }).click();
  await page.getByRole('button', { name: '验证交互可靠性', exact: true }).click();
  await expect(editor).toContainText('尚未提交的草稿');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText(/尚未提交的草稿/)).not.toBeVisible();
});
test('opening an editor does not turn Markdown normalization into an unsaved edit', async ({ page }) => {
  const { issue } = await fixture(page);
  await page.getByRole('button', { name: '验证交互可靠性', exact: true }).click();
  await page.getByRole('button', { name: '编辑描述', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'editable markdown', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '描述尚未保存' })).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '事项详情' })).not.toBeVisible();
  expect((await (await page.request.get(`/api/issues/${issue.id}`)).json()).version).toBe(1);
});

test('dragging card body gives stable insertion cue and persists before/after order', async ({ page }) => {
  const { project, issue } = await fixture(page);
  const other = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: { type: 'TASK', title: '第二张排序卡片' },
    })
  ).json();
  await page.reload();
  const first = page.locator('.issue-card').filter({ hasText: issue.key });
  const second = page.locator('.issue-card').filter({ hasText: other.key });
  const a = await first.boundingBox(),
    b = await second.boundingBox();
  if (!a || !b) throw new Error('Card geometry missing');
  let count = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) count++;
  });
  await page.mouse.move(a.x + 40, a.y + 45);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + b.height - 15, { steps: 15 });
  await expect(page.locator('.drop-indicator')).toHaveCount(1);
  const stable = await second.boundingBox();
  expect(stable?.y).toBe(b.y);
  await page.mouse.move(b.x + 63, b.y + b.height - 14, { steps: 4 });
  expect((await second.boundingBox())?.y).toBe(b.y);
  await page.mouse.up();
  await expect.poll(() => count).toBe(1);
  await expect
    .poll(async () => {
      const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
      return board.issues.filter((i: { type: string }) => i.type !== 'EPIC').map((i: { id: string }) => i.id);
    })
    .toEqual([other.id, issue.id]);
  await page.reload();
  const from = await first.boundingBox(),
    to = await second.boundingBox();
  if (!from || !to) throw new Error('Card geometry missing');
  await page.mouse.move(from.x + 45, from.y + 45);
  await page.mouse.down();
  await page.mouse.move(to.x + 50, to.y + 15, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => count).toBe(2);
  await expect
    .poll(async () =>
      (await (await page.request.get(`/api/projects/${project.id}/board`)).json()).issues.map(
        (i: { id: string }) => i.id,
      ),
    )
    .toEqual([issue.id, other.id]);
  await first.getByRole('button', { name: issue.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: '事项详情' })).toBeVisible();
});

test('Escape cancels a drag without writing', async ({ page }) => {
  const { issue } = await fixture(page);
  let count = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) count++;
  });
  const a = await page.getByRole('button', { name: `拖动 ${issue.key}` }).boundingBox();
  const b = await page.getByRole('region', { name: 'Code Review', exact: true }).boundingBox();
  if (!a || !b) throw new Error('Geometry missing');
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 50, b.y + 50, { steps: 12 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-preview')).toHaveCount(0);
  expect(count).toBe(0);
});

test('creation includes rich description, preserves failed draft and resets continuous creation', async ({
  page,
}) => {
  const { project } = await fixture(page);
  await page.getByRole('button', { name: /^新建事项/ }).click();
  await page.getByPlaceholder('需要完成什么？').fill('创建时完整描述');
  const editor = page.getByRole('textbox', { name: 'editable markdown', exact: true });
  await editor.click();
  await editor.press('/');
  await page.getByRole('menuitem', { name: '任务清单' }).click();
  await expect(editor).toContainText('待完成事项');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(editor).toContainText('待完成事项');
  await page.route(
    `**/api/projects/${project.id}/issues`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '暂时无法创建' }),
      }),
    { times: 1 },
  );
  await page.getByRole('button', { name: '创建事项', exact: true }).click();
  await expect(page.getByText('暂时无法创建')).toBeVisible();
  await expect(editor).toContainText('待完成事项');
  await page.getByRole('checkbox', { name: '继续创建下一个' }).check();
  await page.getByRole('button', { name: '创建事项', exact: true }).click();
  await expect(page.getByPlaceholder('需要完成什么？')).toHaveValue('');
  await expect(editor).not.toContainText('待完成事项');
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const created = board.issues.filter((i: { title: string }) => i.title === '创建时完整描述');
  expect(created).toHaveLength(1);
  expect(created[0].description).toMatch(/[-*] \[ \] 待完成事项/);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '创建时完整描述', exact: true }).click();
  await expect(page.getByText('待完成事项', { exact: true })).toBeVisible();
});

test('keyboard drag reorders with Space and arrow keys', async ({ page }) => {
  const { project, issue } = await fixture(page);
  const other = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: { type: 'TASK', title: '键盘排序目标' },
    })
  ).json();
  await page.reload();
  const handle = page.getByRole('button', { name: `拖动 ${issue.key}` });
  await handle.focus();
  // Hold the activation key for a human keypress: the sensor registers listeners asynchronously.
  await page.keyboard.press('Space', { delay: 100 });
  await expect(page.locator('.drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.drop-indicator')).toHaveCount(1);
  const response = page.waitForResponse((r) => r.url().endsWith('/board/moves'));
  await page.keyboard.press('Space');
  expect((await response).ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('.section-cards .issue-key')).toHaveText([other.key, issue.key]);
});

test('occupied section gap is a precise insertion target', async ({ page }) => {
  const { project, board, issue } = await fixture(page);
  const targetStatus = board.statuses.find((s: { name: string }) => s.name === 'In Progress');
  const others = [];
  for (const title of ['目标第一张', '目标第二张']) {
    others.push(
      await (
        await page.request.post(`/api/projects/${project.id}/issues`, {
          data: { type: 'TASK', title, statusId: targetStatus.id },
        })
      ).json(),
    );
  }
  await page.reload();
  const a = await page.locator('.issue-card').filter({ hasText: issue.key }).boundingBox();
  const b = await page.locator('.issue-card').filter({ hasText: others[0].key }).boundingBox();
  if (!a || !b) throw new Error('Geometry missing');
  await page.mouse.move(a.x + 40, a.y + 45);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + b.height + 4, { steps: 15 });
  const response = page.waitForResponse((r) => r.url().endsWith('/board/moves'));
  await page.mouse.up();
  expect((await response).ok()).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'In Progress', exact: true }).locator('.issue-key'),
  ).toHaveText([others[0].key, issue.key, others[1].key]);
});

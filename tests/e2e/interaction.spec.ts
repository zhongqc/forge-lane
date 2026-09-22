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
test('cross-column drag exposes all status zones and persists the chosen status once', async ({ page }) => {
  const { issue, board } = await fixture(page);
  let count = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) count++;
  });
  await expect(page.locator('.status-drop-zone')).toHaveCount(0);
  const a = await page.getByRole('button', { name: `拖动 ${issue.key}` }).boundingBox();
  if (!a) throw new Error('Drag bounds missing');
  await page.mouse.move(a.x + 30, a.y + 40);
  await page.mouse.down();
  await page.mouse.move(a.x + 45, a.y + 45, { steps: 5 });
  await expect(page.locator('.status-drop-zone')).toHaveCount(6);
  await expect(page.getByRole('region', { name: '移至 In Progress', exact: true })).toBeVisible();
  const drop = page.getByRole('region', { name: '移至 Code Review', exact: true });
  const b = await drop.boundingBox();
  if (!b) throw new Error('Drop bounds missing');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await expect(drop).toHaveClass(/selected/);
  const response = page.waitForResponse((r) => r.url().endsWith('/board/moves'));
  await page.mouse.up();
  expect((await response).ok()).toBeTruthy();
  await expect(page.locator('.status-drop-zone')).toHaveCount(0);
  expect(count).toBe(1);
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: '开发中', exact: true })
      .getByRole('button', { name: issue.title, exact: true }),
  ).toBeVisible();
  const saved = await (await page.request.get(`/api/issues/${issue.id}`)).json();
  expect(saved.statusId).toBe(board.statuses.find((s: { name: string }) => s.name === 'Code Review').id);
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
  const { project, issue, board } = await fixture(page);
  const other = await (
    await page.request.post(`/api/projects/${project.id}/issues`, {
      data: { type: 'TASK', title: '第二张排序卡片', statusId: board.columns[0].statuses[1].statusId },
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
  expect((await (await page.request.get(`/api/issues/${issue.id}`)).json()).statusId).toBe(issue.statusId);
  await first.getByRole('button', { name: issue.title, exact: true }).click({ delay: 100 });
  await expect(page.getByRole('dialog', { name: '事项详情' })).toBeVisible();
});

test('Escape cancels a drag without writing', async ({ page }) => {
  const { issue } = await fixture(page);
  let count = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/board/moves')) count++;
  });
  const a = await page.getByRole('button', { name: `拖动 ${issue.key}` }).boundingBox();
  if (!a) throw new Error('Geometry missing');
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(a.x + 25, a.y + 25, { steps: 5 });
  const b = await page.getByRole('region', { name: '移至 Code Review', exact: true }).boundingBox();
  if (!b) throw new Error('Drop bounds missing');
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
  await page.locator('.topbar').getByRole('button', { name: '创建事项', exact: true }).click();
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

test('cross-column status zones remain visible over populated columns and append without ranking coordinates', async ({
  page,
}) => {
  const { project, board, issue } = await fixture(page);
  const targetColumn = board.columns[2];
  const others = [];
  for (const [index, title] of ['目标第一张', '目标第二张'].entries()) {
    others.push(
      await (
        await page.request.post(`/api/projects/${project.id}/issues`, {
          data: { type: 'TASK', title, statusId: targetColumn.statuses[index].statusId },
        })
      ).json(),
    );
  }
  await page.reload();
  const a = await page.getByRole('button', { name: `拖动 ${issue.key}` }).boundingBox();
  if (!a) throw new Error('Geometry missing');
  await page.mouse.move(a.x + 40, a.y + 45);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 50, { steps: 5 });
  for (const name of ['Ready for Test', 'Testing', 'Ready for Release']) {
    await expect(page.getByRole('region', { name: `移至 ${name}`, exact: true })).toBeVisible();
  }
  const drop = page.getByRole('region', { name: '移至 Ready for Release', exact: true });
  const b = await drop.boundingBox();
  if (!b) throw new Error('Missing drop zone');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  const response = page.waitForResponse((r) => r.url().endsWith('/board/moves'));
  await page.mouse.up();
  const result = await response;
  expect(result.ok()).toBeTruthy();
  expect(result.request().postDataJSON()).toMatchObject({
    intent: 'transition',
    targetStatusId: targetColumn.statuses[2].statusId,
  });
  expect(result.request().postDataJSON()).not.toHaveProperty('nextIssueId');
  expect(result.request().postDataJSON()).not.toHaveProperty('previousIssueId');
  await page.reload();
  await expect(page.getByRole('region', { name: '测试中', exact: true }).locator('.issue-key')).toHaveText([
    others[0].key,
    others[1].key,
    issue.key,
  ]);
});

test('every card surface can start dragging without opening details', async ({ page }) => {
  const { issue } = await fixture(page);
  const card = page.getByRole('article').filter({ hasText: issue.key });
  for (const surface of ['.issue-key', '.card-title', '.card-type', '.card-bottom', '.card-epic', null]) {
    await card.scrollIntoViewIfNeeded();
    const rect = await (surface ? card.locator(surface) : card).boundingBox();
    if (!rect) throw new Error(`Missing card surface: ${surface}`);
    const x = rect.x + (surface ? Math.max(2, rect.width / 2) : 3);
    const y = rect.y + (surface ? Math.max(2, rect.height / 2) : 3);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 35, y + 20, { steps: 8 });
    await expect(page.locator('.drag-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.drag-preview')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: '事项详情' })).toHaveCount(0);
  }
  await card.getByRole('button', { name: issue.title, exact: true }).click({ delay: 100 });
  await expect(page.getByRole('dialog', { name: '事项详情' })).toBeVisible();
});

test('global creation is available across views without board creation buttons', async ({ page }) => {
  const { project } = await fixture(page);
  for (const view of ['board', 'backlog', 'issues', 'epics', 'settings']) {
    await page.goto(`/projects/${project.key}/${view}`);
    const create = page.locator('.topbar').getByRole('button', { name: '创建事项', exact: true });
    await expect(create).toBeEnabled();
    await expect(
      page.locator('.page-heading').getByRole('button', { name: /新建事项|新建 Epic/ }),
    ).toHaveCount(0);
    await create.click();
    await expect(page.getByRole('dialog', { name: '新建事项', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '事项类型', exact: true })).toContainText(
      view === 'epics' ? 'Epic' : 'Task',
    );
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }
  await page.goto(`/projects/${project.key}/board`);
  await expect(page.locator('.board-column').getByRole('button', { name: /新建事项|添加事项/ })).toHaveCount(
    0,
  );
});

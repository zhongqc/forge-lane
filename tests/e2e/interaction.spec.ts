import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';
import { register } from './support/register';
async function fixture(page: Page, memberName = '体验成员') {
  const tag = Date.now().toString(36).toUpperCase();
  await register(page.request, {
    email: `qa-${tag}@forge.test`,
    password: 'Test-experience-2026',
    name: memberName,
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
test('assignee menu avatars stay circular and aligned at desktop and narrow widths', async ({ page }) => {
  const { issue } = await fixture(page, '名字特别长的产品开发协作负责人');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: issue.title, exact: true }).click();
    await page
      .getByRole('dialog', { name: '事项详情' })
      .getByRole('button', { name: '负责人', exact: true })
      .click();
    const options = page.getByRole('listbox', { name: '负责人' }).getByRole('option');
    await expect(options).toHaveCount(2);
    const positions = await options.evaluateAll((nodes) =>
      nodes.map((node) => {
        const avatar = node.querySelector('.avatar')!.getBoundingClientRect();
        const label = node.querySelector(':scope > span:not(.avatar)')!.getBoundingClientRect();
        return {
          width: avatar.width,
          height: avatar.height,
          avatarRight: avatar.right,
          labelLeft: label.left,
        };
      }),
    );
    for (const position of positions) {
      expect(position.width).toBeCloseTo(22, 0);
      expect(position.height).toBeCloseTo(22, 0);
      expect(position.labelLeft).toBeGreaterThanOrEqual(position.avatarRight);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  }
});
test('new workflow status can be placed in the testing board column', async ({ page }) => {
  const { project } = await fixture(page);
  await page.goto(`/projects/${project.key}/settings`);
  const form = page
    .locator('section.settings-card')
    .filter({ has: page.getByRole('heading', { name: '工作流与看板映射' }) })
    .locator('form');
  await form.getByPlaceholder('新状态名称').fill('待测试确认');
  await form.getByLabel('新状态分类').selectOption('IN_PROGRESS');
  await form.getByLabel('新状态所在列').selectOption({ label: '测试中' });
  await form.getByRole('button', { name: '添加状态' }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const status = board.statuses.find((item: { name: string }) => item.name === '待测试确认');
  expect(status.category).toBe('IN_PROGRESS');
  expect(board.columns.find((column: { name: string }) => column.name === '测试中').statuses).toEqual(
    expect.arrayContaining([expect.objectContaining({ statusId: status.id })]),
  );
});
test('reporter defaults to creator and can be selected during creation and editing', async ({
  page,
  browser,
}) => {
  const { project } = await fixture(page);
  const creator = (await (await page.request.get('/api/me')).json()).actor;
  const defaultIssue = await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'TASK', title: '默认报告人' },
  });
  expect(defaultIssue.status()).toBe(201);
  expect((await defaultIssue.json()).reporter.id).toBe(creator.id);
  const invalidReporter = await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'TASK', title: '无效报告人', reporterId: '00000000-0000-4000-8000-000000000000' },
  });
  expect(invalidReporter.status()).toBe(422);
  const email = `reporter-${Date.now()}@forge.test`;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    await register(context.request, { email, password: 'Reporter-test-2026', name: '报告成员' });
    const member = await (
      await page.request.post('/api/workspace/members', { data: { email, role: 'MEMBER' } })
    ).json();
    await page.request.post(`/api/projects/${project.id}/members`, {
      data: { actorId: member.actorId, role: 'MEMBER' },
    });
    await page.reload();
    await page.getByRole('button', { name: '创建事项', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建事项' });
    await expect(dialog.getByRole('button', { name: '报告人' })).toContainText(creator.name);
    await dialog.getByRole('button', { name: '报告人' }).click();
    await page.getByRole('option', { name: '报告成员' }).click();
    await dialog.getByPlaceholder('需要完成什么？').fill('报告人可选');
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${project.id}/issues`) && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '创建事项' }).click();
    expect((await created).status()).toBe(201);

    const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
    const issue = board.issues.find((item: { title: string }) => item.title === '报告人可选');
    expect(issue.reporter.id).toBe(member.actorId);
    await page.goto(`/issues/${issue.key}`);
    const details = page.getByRole('dialog', { name: '事项详情' });
    await details.getByRole('button', { name: '报告人', exact: true }).click();
    await page.getByRole('option', { name: creator.name }).click();
    await expect(details.getByRole('button', { name: '报告人', exact: true })).toContainText(creator.name);
    expect((await (await page.request.get(`/api/issues/${issue.id}`)).json()).reporter.id).toBe(creator.id);
  } finally {
    await context.close();
  }
});
test('dropdown option icons keep their size in create and detail views', async ({ page }) => {
  const { issue } = await fixture(page);
  await page.getByRole('button', { name: '创建事项', exact: true }).click();
  const create = page.getByRole('dialog', { name: '新建事项' });
  await create.getByRole('button', { name: '事项类型' }).click();
  const createIcon = page
    .getByRole('listbox', { name: '事项类型' })
    .getByRole('option')
    .first()
    .locator('.type-icon');
  expect((await createIcon.boundingBox())!.width).toBeLessThanOrEqual(20);
  await page.keyboard.press('Escape');
  await create.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: issue.title, exact: true }).click();
  const detail = page.getByRole('dialog', { name: '事项详情' });
  await detail.getByRole('button', { name: '状态', exact: true }).click();
  const statusIcon = page
    .getByRole('listbox', { name: '状态' })
    .getByRole('option')
    .first()
    .locator('.status-dot');
  expect((await statusIcon.boundingBox())!.width).toBeLessThanOrEqual(10);
});
test('creation fields match editable issue properties', async ({ page }) => {
  const { project } = await fixture(page);
  const label = await (
    await page.request.post(`/api/projects/${project.id}/labels`, {
      data: { name: '前端验证', color: '#7161a9' },
    })
  ).json();
  await page.reload();
  await page.getByRole('button', { name: '创建事项', exact: true }).click();
  const create = page.getByRole('dialog', { name: '新建事项' });
  await expect(create.getByRole('button', { name: '状态' }).locator('.status-dot')).toBeVisible();
  await expect(create.getByRole('button', { name: '优先级' }).locator('.priority')).toBeVisible();
  await create.getByRole('button', { name: '标签' }).click();
  await page.getByRole('listbox', { name: '标签' }).getByRole('option', { name: '前端验证' }).click();
  await create.getByPlaceholder('需要完成什么？').fill('创建时设置标签');
  await create.getByRole('button', { name: '创建事项' }).click();
  await expect(create).toBeHidden();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const created = board.issues.find((issue: { title: string }) => issue.title === '创建时设置标签');
  expect(created.labels).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: expect.objectContaining({ id: label.id }) })]),
  );
});
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
test('board card starts dragging from its corners and title', async ({ page }) => {
  const { issue } = await fixture(page);
  const card = page.locator('.issue-card').filter({ has: page.getByRole('button', { name: issue.title }) });
  const box = await card.boundingBox();
  if (!box) throw new Error('Card bounds missing');
  expect(await card.evaluate((node) => getComputedStyle(node).touchAction)).toBe('none');
  expect(await card.evaluate((node) => getComputedStyle(node).cursor)).toBe('grab');
  const handle = await card.getByRole('button', { name: `拖动 ${issue.key}` }).boundingBox();
  if (!handle) throw new Error('Keyboard drag handle missing');
  expect(handle.width).toBeLessThanOrEqual(24);
  await card.getByRole('button', { name: issue.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: '事项详情' })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  const points = [
    [box.x + 4, box.y + 4],
    [box.x + box.width - 4, box.y + 4],
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x + 4, box.y + box.height - 4],
    [box.x + box.width - 4, box.y + box.height - 4],
  ];
  for (const [x, y] of points) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 15, y + 10, { steps: 5 });
    await expect(page.locator('.status-drop-zone')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.status-drop-zone')).toHaveCount(0);
  }
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
      data: { type: 'TASK', title: '第二张排序卡片', statusId: board.columns[0].statuses[0].statusId },
    })
  ).json();
  await page.reload();
  // Font swapping changes card text height; measure only after final fonts are ready.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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
  // Font swapping changes card text height; measure only after final fonts are ready.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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

test('board fills remaining height after resizing with persistent filters', async ({ page }) => {
  await fixture(page);
  await expect(page.getByRole('group', { name: '筛选事项' })).toBeVisible();
  await expect(page.getByRole('button', { name: '负责人', exact: true })).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1050, height: 720 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    for (const expanded of [false, true]) {
      if (expanded) await page.getByRole('button', { name: '我的事项', exact: true }).click();
      await expect
        .poll(async () => {
          const bounds = await page.locator('.column-scroll').first().boundingBox();
          return bounds ? Math.round(viewport.height - bounds.y - bounds.height) : -1;
        })
        .toBe(viewport.width <= 760 ? 14 : 16);
      const bounds = await page.locator('.column-scroll').first().boundingBox();
      expect(bounds!.height).toBeGreaterThan(200);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        viewport.height,
      );
      if (expanded) await page.getByRole('button', { name: '我的事项', exact: true }).click();
    }
  }
  await page.setViewportSize({ width: 1050, height: 400 });
  await expect
    .poll(async () => {
      const bounds = await page.locator('.column-scroll').first().boundingBox();
      return Math.round(bounds?.height ?? 0);
    })
    .toBeGreaterThanOrEqual(300);
  expect(
    await page.locator('.main-content').evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(async () => {
      const bounds = await page.locator('.column-scroll').first().boundingBox();
      return Math.round(900 - bounds!.y - bounds!.height);
    })
    .toBe(16);
});

test('avatar filters support multiple assignees and stay in sync with the dropdown', async ({
  page,
  browser,
}) => {
  const { project, board } = await fixture(page);
  const owner = board.members[0];
  const email = `avatar-${Date.now()}@forge.test`;
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    await context.request.post('/api/auth/register', {
      data: { email, password: 'Avatar-test-2026', name: '头像成员' },
    });
    const member = await (
      await page.request.post('/api/workspace/members', { data: { email, role: 'MEMBER' } })
    ).json();
    expect(
      (
        await page.request.post(`/api/projects/${project.id}/members`, {
          data: { actorId: member.actorId, role: 'MEMBER' },
        })
      ).ok(),
    ).toBeTruthy();
    for (const [assigneeId, title] of [
      [owner.id, '负责人的事项'],
      [member.actorId, '其他成员事项'],
    ]) {
      expect(
        (
          await page.request.post(`/api/projects/${project.id}/issues`, {
            data: { type: 'TASK', title, assigneeId },
          })
        ).ok(),
      ).toBeTruthy();
    }
    await page.reload();
    const first = page.getByRole('button', { name: `筛选负责人：${owner.name}`, exact: true });
    const second = page.getByRole('button', { name: '筛选负责人：头像成员', exact: true });
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveCSS('opacity', '0.4');
    await expect(page.getByRole('button', { name: '其他成员事项', exact: true })).not.toBeVisible();
    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveCSS('opacity', '1');
    await expect(page.getByRole('button', { name: '其他成员事项', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '负责人的事项', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '验证交互可靠性', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: '负责人 2', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: owner.name, exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: owner.name, exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await second.click();
    await expect(page.getByRole('button', { name: '验证交互可靠性', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('account menu is available in the header on desktop and mobile', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('aside').getByText('体验成员', { exact: true })).toHaveCount(0);
  await expect(page.getByText('让好的想法，')).toHaveCount(0);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('banner').getByRole('button', { name: '账号菜单', exact: true });
    await trigger.click();
    const menu = page.getByRole('dialog', { name: '账号信息' });
    await expect(menu).toContainText('体验成员');
    await expect(menu).toContainText('工作区管理员');
    await expect(menu.getByRole('button', { name: '退出登录' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  const logout = page.waitForResponse((response) => response.url().endsWith('/auth/logout'));
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  expect((await logout).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: '登录工作区', exact: true })).toBeVisible();
});

test('avatar upload shows errors and refreshes the account photo after retry', async ({ page }) => {
  await fixture(page);
  const pixels = Buffer.alloc(600 * 300 * 3);
  for (let index = 0; index < 600 * 300; index++) pixels[index * 3 + (index % 600 < 300 ? 0 : 2)] = 255;
  const png = await sharp(pixels, { raw: { width: 600, height: 300, channels: 3 } })
    .png()
    .toBuffer();
  let uploaded = false;
  let attempts = 0;
  await page.route('**/api/me', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (uploaded) body.actor.avatarKey = `avatars/${body.actor.id}/test.webp`;
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/actors/*/avatar?*', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.route('**/api/me/avatar', async (route) => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    const multipart = route.request().postDataBuffer()!;
    const file = multipart.subarray(multipart.indexOf('\r\n\r\n') + 4, multipart.lastIndexOf('\r\n--'));
    expect(await sharp(file).metadata()).toMatchObject({ width: 256, height: 256, format: 'webp' });
    const stats = await sharp(file).stats();
    expect(stats.channels[2]!.mean).toBeGreaterThan(stats.channels[0]!.mean);
    attempts++;
    uploaded = attempts > 1;
    await route.fulfill({
      status: uploaded ? 201 : 502,
      json: uploaded ? {} : { message: '头像上传失败，请稍后重试' },
    });
  });
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  const input = page.getByLabel('选择头像', { exact: true });
  await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
  await expect(dialog).toBeVisible();
  expect(attempts).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.getByRole('slider', { name: '头像缩放' }).boundingBox())!.width).toBeGreaterThan(150);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(attempts).toBe(0);
  await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('slider', { name: '头像缩放' }).focus();
  await page.getByRole('slider', { name: '头像缩放' }).press('End');
  const stage = page.locator('.avatar-crop-stage');
  const bounds = (await stage.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 130, bounds.y + bounds.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.screenshot({ path: test.info().outputPath('avatar-crop-preview.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: '确认并上传', exact: true }).click();
  await expect(page.getByText('头像上传失败，请稍后重试', { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('slider', { name: '头像缩放' })).toHaveValue('3');
  await dialog.getByRole('button', { name: '确认并上传', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const avatar = page.locator('.account-trigger img');
  await expect(avatar).toBeVisible();
  await expect.poll(() => avatar.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(600);
  expect(attempts).toBe(2);
});

test('description history and edit actions do not overlap on desktop or mobile', async ({ page }) => {
  const { issue } = await fixture(page);
  await page.goto(`/issues/${issue.key}`);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const history = page.getByRole('button', { name: '版本记录', exact: true });
    const edit = page.getByRole('button', { name: '编辑描述', exact: true });
    await expect(edit).toBeVisible();
    await history.scrollIntoViewIfNeeded();
    const a = await history.boundingBox();
    const b = await edit.boundingBox();
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x - 4);
    await history.click();
    await expect(page.getByRole('dialog', { name: '描述版本记录', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await edit.click();
    await expect(page.getByRole('textbox', { name: 'editable markdown', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(edit).toBeVisible();
  }
});

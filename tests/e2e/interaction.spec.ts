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

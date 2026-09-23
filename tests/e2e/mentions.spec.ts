import { test, expect } from '@playwright/test';

test('project member mentions persist from creation, description and comments and appear in recipient inbox', async ({
  page,
  browser,
}) => {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const email = `mention-recipient-${tag}@forge.test`;
  const recipientContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const recipient = await recipientContext.newPage();
  await recipient.request.post('/api/auth/register', {
    data: { email, password: 'Mention-test-2026', name: '提及接收人' },
  });
  await page.request.post('/api/auth/register', {
    data: { email: `mention-sender-${tag}@forge.test`, password: 'Mention-test-2026', name: '提及发送人' },
  });
  const me = await (await page.request.get('/api/me')).json();
  const project = await (
    await page.request.post('/api/projects', {
      data: { name: '提及验证', key: `M${tag.toUpperCase().slice(-10)}` },
    })
  ).json();
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
  await recipient.request.post('/api/workspaces/select', { data: { workspaceId: me.workspace.id } });
  const members = await (await page.request.get(`/api/projects/${project.id}/mention-members`)).json();
  expect(members.some((m: { id: string }) => m.id === member.actorId)).toBeTruthy();
  await page.goto(`/projects/${project.key}/board`);
  await page.getByRole('button', { name: '创建事项', exact: true }).click();
  await page.getByPlaceholder('需要完成什么？').fill('包含提及的新事项');
  const editor = page.getByRole('textbox', { name: 'editable markdown', exact: true });
  await editor.fill('@提及接收');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toBeVisible();
  await expect(page.getByRole('option', { name: /提及接收人/ })).toBeVisible();
  await editor.press('Escape');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await editor.fill('@提及接');
  await expect(page.getByRole('option', { name: /提及接收人/ })).toBeVisible();
  await editor.press('Enter');
  const created = page.waitForResponse(
    (r) => r.url().endsWith(`/projects/${project.id}/issues`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建事项', exact: true }).last().click();
  expect((await created).ok()).toBeTruthy();
  const board = await (await page.request.get(`/api/projects/${project.id}/board`)).json();
  const issue = board.issues.find((i: { title: string }) => i.title === '包含提及的新事项');
  expect(issue.description).toContain(`/mentions/${member.actorId}`);
  await page.goto(`/issues/${issue.key}`);
  await expect(page.locator('.mention-chip').first()).toHaveText('@提及接收人');
  await page.getByRole('button', { name: '编辑描述', exact: true }).click();
  await editor.press('ControlOrMeta+a');
  await editor.press('Backspace');
  await editor.pressSequentially('更新描述 @提及接收');
  await page.getByRole('option', { name: /提及接收人/ }).click();
  await page.getByRole('textbox', { name: '评论内容' }).click();
  await expect(page.getByRole('button', { name: '编辑描述', exact: true })).toBeVisible();
  const comment = page.getByRole('textbox', { name: '评论内容' });
  await comment.fill('email@example.com');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toHaveCount(0);
  await comment.fill('`@提及`');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toHaveCount(0);
  await comment.fill('@提及接收');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toBeVisible();
  await comment.press('Escape');
  await expect(page.getByRole('listbox', { name: '提及项目成员' })).toHaveCount(0);
  await comment.fill('@提及接收');
  await expect(comment).toHaveText('@提及接收');
  await comment.fill('评论 @提及接收');
  await comment.press('ArrowDown');
  await comment.press('Enter');
  await expect(comment.locator('a')).toHaveText('@提及接收人');
  await expect(comment).not.toContainText(member.actorId);
  await page.getByRole('button', { name: '编辑描述', exact: true }).focus();
  await expect(page.locator('.comment')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '包含提及的新事项', exact: true }).click();
  await expect(comment.locator('a')).toHaveText('@提及接收人');
  await comment.click();
  await comment.press('ControlOrMeta+End');
  await comment.press('Backspace');
  await comment.press('Backspace');
  await expect(comment.locator('a')).toHaveCount(0);
  await comment.press('ControlOrMeta+z');
  await expect(comment.locator('a')).toHaveText('@提及接收人');
  await page.route('**/api/issues/*/comments', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '模拟发布失败' }),
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: '发送评论', exact: true }).click();
  await expect(page.getByText('模拟发布失败')).toBeVisible();
  await expect(comment.locator('a')).toHaveText('@提及接收人');
  await page.unroute('**/api/issues/*/comments');
  await page.getByRole('button', { name: '发送评论', exact: true }).click();
  await expect(page.locator('.comment .mention-chip')).toHaveText('@提及接收人');
  await expect(comment).toHaveText('');
  await comment.pressSequentially('未发布的新草稿');
  await page.locator('.comment-actions').getByRole('button', { name: '编辑', exact: true }).click();
  await expect(comment.locator('a')).toHaveText('@提及接收人');
  await comment.press('ControlOrMeta+Home');
  await comment.press('ControlOrMeta+b');
  await comment.pressSequentially('进展');
  await comment.press('ControlOrMeta+b');
  await page.getByRole('button', { name: '保存评论', exact: true }).click();
  await expect(page.locator('.comment .markdown strong')).toHaveText('进展');
  await expect(comment).toHaveText('未发布的新草稿');
  await page.screenshot({ path: test.info().outputPath('rich-comments.png') });
  await recipient.goto(`/projects/${project.key}/board`);
  await recipient.getByRole('button', { name: /通知，2 条未读/ }).click();
  await expect(recipient.getByLabel('通知列表')).toContainText('包含提及的新事项');
  await recipient.getByRole('button', { name: /提及发送人 在评论中提及了你/ }).click();
  await expect(recipient).toHaveURL(new RegExp(`/issues/${issue.key}#comment-`));
  await expect(recipient.locator('.comment .mention-chip')).toHaveText('@提及接收人');
  await recipient.getByRole('button', { name: '关闭详情', exact: true }).click();
  await recipient.getByRole('button', { name: /通知，1 条未读/ }).click();
  await recipient.getByRole('button', { name: '全部标为已读' }).click();
  await expect(recipient.getByRole('button', { name: '通知', exact: true })).toBeVisible();
  await recipient.screenshot({ path: test.info().outputPath('mention-inbox.png') });
  await recipientContext.close();
});

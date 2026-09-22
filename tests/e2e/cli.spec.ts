import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { Issue, Project } from '../../packages/shared/src/contracts';

test('CLI execution activity shows the human actor, executor, Markdown result and pull request', async ({
  page,
}, info) => {
  const tag = Date.now().toString(36).toUpperCase();
  const actorName = 'CLI 开发成员';
  const executor = 'codex-browser-verification';
  const prUrl = 'https://github.com/acme/forge/pull/42';
  const registered = await page.request.post('/api/auth/register', {
    data: {
      email: `cli-browser-${randomUUID()}@forge.test`,
      password: `Testing-${randomUUID()}`,
      name: actorName,
    },
  });
  expect(registered.status()).toBe(201);
  const createdProject = await page.request.post('/api/projects', {
    data: { name: 'CLI 执行活动验收', key: `B${tag}` },
  });
  expect(createdProject.status()).toBe(201);
  const project = (await createdProject.json()) as Project;
  const createdIssue = await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'TASK', title: '展示开发执行结果' },
  });
  expect(createdIssue.status()).toBe(201);
  const issue = (await createdIssue.json()) as Issue;
  const issuedToken = await page.request.post('/api/auth/tokens', {
    data: { name: 'CLI browser test', projectIds: [project.id], scopes: ['read', 'write'] },
  });
  expect(issuedToken.status()).toBe(201);
  const credential = (await issuedToken.json()) as { token: string };
  const headers = { Authorization: `Bearer ${credential.token}` };
  const claimed = await page.request.post(`/api/issues/${issue.id}/claim`, {
    headers,
    data: { version: issue.version, executor, leaseMinutes: 30 },
  });
  expect(claimed.status()).toBe(201);
  const execution = (await claimed.json()) as { id: string; version: number };
  const finished = await page.request.post(`/api/executions/${execution.id}/finish`, {
    headers,
    data: {
      version: execution.version,
      outcome: 'SUCCEEDED',
      summary: '**实现完成**\n\n- 通过浏览器验证\n- 保留真实操作人',
      prUrl,
    },
  });
  expect(finished.status()).toBe(201);

  await page.goto(`/projects/${project.key}/board`);
  await page.getByRole('button', { name: issue.title, exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: '活动记录', exact: true }).click();
  const claimedActivity = drawer.locator('.activity-item').filter({ hasText: '领取了任务' });
  await expect(claimedActivity).toContainText(actorName);
  await expect(claimedActivity).toContainText(executor);
  const completedActivity = drawer.locator('.activity-item').filter({ hasText: '完成了开发执行' });
  await expect(completedActivity).toContainText(actorName);
  await expect(completedActivity).toContainText(executor);
  await expect(completedActivity.locator('.markdown strong')).toHaveText('实现完成');
  await expect(completedActivity.getByRole('listitem')).toHaveText(['通过浏览器验证', '保留真实操作人']);
  const prLink = completedActivity.getByRole('link', { name: '查看 Pull Request', exact: true });
  await expect(prLink).toHaveAttribute('href', prUrl);
  await expect(prLink).toHaveAttribute('target', '_blank');
  await completedActivity.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('cli-execution-activity.png') });
});

import { test, expect, type Page } from '@playwright/test';
import type { BoardData, Issue } from '../../packages/shared/src/contracts';
import type { GitHubRepository, GitHubSettings, GitHubRule } from '../../packages/shared/src/github';
async function fixture(page: Page) {
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  const registered = await page.request.post('/api/auth/register', {
    data: { email: `github-${tag}@forge.test`, password: 'GitHub-browser-2026', name: 'GitHub 验证' },
  });
  expect(registered.ok()).toBeTruthy();
  const created = await page.request.post('/api/projects', {
    data: { name: 'GitHub 浏览器验证', key: `G${tag}` },
  });
  expect(created.ok()).toBeTruthy();
  const project = (await created.json()) as BoardData['project'];
  const board = (await (await page.request.get(`/api/projects/${project.id}/board`)).json()) as BoardData;
  return { project, board };
}
const configured: GitHubSettings = {
  configured: true,
  webhookConfigured: true,
  webhookUrl: 'https://forge.example/api/github/webhook',
  appUrl: 'https://github.com/apps/forge-browser-test/installations/new',
  repositories: [],
};
test('unconfigured GitHub explains deployment, installation authorization and webhook without credential inputs', async ({
  page,
}, info) => {
  const { project } = await fixture(page);
  await page.route(`**/api/projects/${project.id}/github`, (route) =>
    route.fulfill({ json: { ...configured, configured: false, webhookConfigured: false, appUrl: null } }),
  );
  await page.goto(`/projects/${project.key}/settings`);
  const github = page.locator('.github-settings');
  await expect(github).toContainText('GitHub App ID、私钥和 Webhook secret');
  await expect(github).toContainText('GITHUB_INSTALLATION_PROJECTS');
  await expect(github.getByLabel('当前项目 ID', { exact: true })).toHaveValue(project.id);
  await expect(github.getByLabel(/授权映射格式/)).toHaveValue(JSON.stringify({ [project.id]: ['123456'] }));
  await expect(github.getByLabel('Webhook 地址')).toHaveValue(configured.webhookUrl);
  await expect(github).toContainText('Webhook 尚未配置');
  await expect(github).toContainText('尚未连接仓库');
  await expect(github.getByRole('button', { name: '连接仓库' })).toHaveCount(0);
  await expect(github.locator('input:not([readonly])')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('github-setup.png') });
});
test('repository connection, default-disabled rules, sync error retry and disabling preserve reviewable state', async ({
  page,
}, info) => {
  const { project, board } = await fixture(page);
  const state: GitHubSettings = structuredClone(configured);
  const patches: { rules?: GitHubRule[]; enabled?: boolean }[] = [];
  let binding: unknown;
  let syncAttempts = 0;
  let syncReads = 0;
  await page.route(`**/api/projects/${project.id}/github**`, async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/sync')) {
      syncAttempts++;
      if (syncAttempts === 1) {
        await route.fulfill({ status: 503, json: { message: 'GitHub 暂时不可用，请重试' } });
        return;
      }
      state.repositories[0].syncing = true;
      syncReads = 0;
      await route.fulfill({ json: { queued: true } });
      return;
    }
    if (request.method() === 'POST') {
      binding = request.postDataJSON();
      state.repositories.push({
        id: 'repo-browser',
        fullName: 'acme/forge',
        installationId: '123456',
        enabled: true,
        rules: [],
        lastSyncedAt: null,
        lastError: '上次同步失败：GitHub 限流',
        syncing: false,
      });
      await route.fulfill({ json: state.repositories[0] });
      return;
    }
    if (request.method() === 'PATCH') {
      const patch = request.postDataJSON() as Partial<GitHubRepository>;
      patches.push(patch);
      Object.assign(state.repositories[0], patch);
      await route.fulfill({ json: state.repositories[0] });
      return;
    }
    if (state.repositories[0]?.syncing && ++syncReads > 1) {
      Object.assign(state.repositories[0], {
        syncing: false,
        lastError: null,
        lastSyncedAt: '2026-09-23T01:00:00Z',
      });
    }
    await route.fulfill({ json: state });
  });
  await page.goto(`/projects/${project.key}/settings`);
  const github = page.locator('.github-settings');
  await github.getByLabel('仓库', { exact: true }).fill('acme/forge');
  await github.getByLabel(/^Installation ID/).fill('123456');
  await github.getByRole('button', { name: '连接仓库', exact: true }).click();
  await expect(github).toContainText('仓库已连接');
  expect(binding).toEqual({ fullName: 'acme/forge', installationId: '123456' });
  await expect(github.getByLabel('仓库', { exact: true })).toHaveValue('');
  const repository = github.locator('.github-repository');
  await expect(repository).toContainText('acme/forge');
  await expect(repository).toContainText('GitHub 限流');
  await repository.getByText('状态自动化规则', { exact: true }).click();
  const rules = repository.locator('.github-rule');
  await expect(rules).toHaveCount(3);
  for (const name of ['PR 打开时', '请求评审时', '所有关联 PR 合并时']) {
    await expect(repository.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  }
  await expect(rules.first().getByLabel('目标状态')).toBeDisabled();
  await repository.getByRole('button', { name: '保存规则' }).click();
  await expect(github).toContainText('自动化规则已保存');
  expect(patches[0]).toEqual({
    rules: ['OPENED', 'REVIEW_REQUESTED', 'MERGED'].map((event) => ({
      event,
      enabled: false,
      fromStatusIds: [],
      targetStatusId: '',
    })),
  });
  await rules.first().getByRole('checkbox', { name: 'PR 打开时', exact: true }).check();
  await expect(repository.getByRole('button', { name: '保存规则' })).toBeDisabled();
  await rules.first().getByRole('checkbox', { name: board.statuses[0].name, exact: true }).check();
  await rules.first().getByRole('checkbox', { name: board.statuses[1].name, exact: true }).check();
  await rules.first().getByLabel('目标状态').selectOption(board.statuses[2].id);
  await repository.getByRole('button', { name: '保存规则' }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1].rules?.[0]).toEqual({
    event: 'OPENED',
    enabled: true,
    fromStatusIds: [board.statuses[0].id, board.statuses[1].id],
    targetStatusId: board.statuses[2].id,
  });
  expect(patches[1].rules?.slice(1).every((r) => !r.enabled)).toBe(true);
  await repository.getByRole('button', { name: '立即同步' }).click();
  await expect(github.getByRole('alert').filter({ hasText: '暂时不可用' })).toBeVisible();
  await repository.getByRole('button', { name: '立即同步' }).click();
  await expect(repository).toContainText('同步中…');
  await expect(repository.getByRole('button', { name: '立即同步' })).toBeDisabled();
  await expect(repository).toContainText('上次同步：', { timeout: 10000 });
  await expect(repository.getByRole('button', { name: '立即同步' })).toBeEnabled();
  await expect(repository.getByRole('alert')).toHaveCount(0);
  expect(syncAttempts).toBe(2);
  await repository.getByRole('button', { name: '停用连接' }).click();
  await expect(repository).toContainText('已停用 · 历史关联保留');
  await expect(repository.getByRole('button', { name: '立即同步' })).toBeDisabled();
  await expect(repository.getByRole('checkbox', { name: 'PR 打开时', exact: true })).toBeDisabled();
  expect(patches[2]).toEqual({ enabled: false });
  await page.screenshot({ path: info.outputPath('github-repository.png') });
});
test('development shows PR state, branches and commit links with empty and retry states', async ({
  page,
}, info) => {
  const { project } = await fixture(page);
  const created = await page.request.post(`/api/projects/${project.id}/issues`, {
    data: { type: 'TASK', title: 'GitHub 开发关联验收' },
  });
  expect(created.ok()).toBeTruthy();
  const issue = (await created.json()) as Issue;
  let read = 0;
  await page.route(`**/api/issues/${issue.id}/development`, async (route) => {
    read++;
    if (read === 1) {
      await route.fulfill({ json: { pullRequests: [], commits: [] } });
      return;
    }
    if (read <= 3) {
      await route.fulfill({ status: 503, json: { message: '开发记录暂时不可用' } });
      return;
    }
    await route.fulfill({
      json: {
        pullRequests: [
          {
            id: 'pr1',
            number: 42,
            title: '完成事项关联',
            url: 'https://github.com/acme/forge/pull/42',
            state: 'MERGED',
            draft: false,
            branch: `feature/${issue.key}`,
            author: 'octocat',
            repository: 'acme/forge',
          },
        ],
        commits: [
          {
            id: 'commit1',
            sha: 'abcdef1234567890',
            message: '修复开发记录\n\n详细说明',
            url: 'https://github.com/acme/forge/commit/abcdef1234567890',
            author: 'octocat',
            repository: 'acme/forge',
          },
        ],
      },
    });
  });
  await page.goto(`/projects/${project.key}/board`);
  await page.getByRole('button', { name: issue.title, exact: true }).click();
  const development = page.locator('.github-development');
  await expect(development).toContainText('暂无关联 PR 或提交');
  await expect(development).toContainText(issue.key);
  await development.getByRole('button', { name: '刷新' }).click();
  await expect(development.getByRole('alert')).toContainText('开发记录暂时不可用');
  await development.getByRole('button', { name: '刷新' }).click();
  await expect(development.getByRole('link', { name: '完成事项关联' })).toHaveAttribute(
    'href',
    'https://github.com/acme/forge/pull/42',
  );
  await expect(development).toContainText('已合并');
  await expect(development).toContainText(`feature/${issue.key}`);
  await expect(development).toContainText('octocat');
  await expect(development.getByRole('link', { name: '修复开发记录' })).toHaveAttribute(
    'href',
    'https://github.com/acme/forge/commit/abcdef1234567890',
  );
  await expect(development).toContainText('abcdef1');
  await expect(development.getByRole('link', { name: '完成事项关联' })).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: info.outputPath('github-development.png') });
});

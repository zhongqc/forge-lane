import { execFileSync } from 'node:child_process';
import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('local IPC snapshot remains available when navigator is offline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-offline-'));
  const app = await electron.launch({
    executablePath: process.env.FORGE_PACKAGED_EXE || undefined,
    args: [...(process.env.FORGE_PACKAGED_EXE ? [] : [resolve('.')]), `--forge-data-dir=${dir}`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  });
  try {
    const repo = join(dir, 'repo');
    execFileSync('/usr/bin/git', ['init', '-b', 'main', repo]);
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible();
    await page.getByLabel('项目名称').fill('离线项目');
    await page.getByLabel('仓库路径').fill(repo);
    await page.getByRole('button', { name: '导入项目', exact: true }).click();
    await expect(page.getByRole('button', { name: '打开任务看板' })).toBeVisible();
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '打开任务看板' }).click();
    await expect(page.getByText('还没有任务，创建第一项本地任务。')).toBeVisible({ timeout: 4000 });
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

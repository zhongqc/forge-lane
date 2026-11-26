import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
test('conflicts retain drafts and permit explicit comparison/retry; Core failures preserve editor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-recovery-')),
    repo = join(dir, 'repo');
  execFileSync('/usr/bin/git', ['init', '-b', 'main', repo]);
  const app = await electron.launch({
    executablePath: process.env.FORGE_PACKAGED_EXE || undefined,
    args: [
      ...(process.env.FORGE_PACKAGED_EXE ? [] : [resolve('.')]),
      `--forge-data-dir=${join(dir, 'data')}`,
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  });
  try {
    const page = await app.firstWindow();
    page.on('dialog', () => {});
    await page.getByLabel('项目名称').fill('恢复测试');
    await page.getByLabel('仓库路径').fill(repo);
    await page.getByRole('button', { name: '导入项目', exact: true }).click();
    await page.getByRole('button', { name: '打开任务看板' }).click();
    await page.getByRole('button', { name: '项目设置', exact: true }).click();
    await page.getByLabel('项目描述').fill('保留的项目草稿');
    await page.evaluate(async () => {
      const s = await window.forge.snapshot();
      if (!s.ok) throw Error();
      const p = s.data.projects[0];
      const r = await window.forge.mutateTask({
        method: 'project.update',
        requestId: crypto.randomUUID(),
        projectId: p.id,
        expectedVersion: p.version,
        name: p.name,
        description: '另一个编辑者',
      });
      if (!r.ok) throw Error(r.error.message);
    });
    await page.getByRole('button', { name: '保存项目设置' }).click();
    await expect(page.getByRole('alert')).toContainText('VERSION_CONFLICT');
    await expect(page.getByLabel('项目描述')).toHaveValue('保留的项目草稿');
    await page.getByRole('button', { name: '读取最新项目设置' }).click();
    await expect(page.getByText('另一个编辑者', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '以最新版本继续编辑当前草稿' }).click();
    await page.getByRole('button', { name: '保存项目设置' }).click();
    await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByLabel('任务标题').fill('中文输入中的草稿');
    await page
      .getByLabel('任务标题')
      .dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    await expect(page.getByLabel('任务标题')).toHaveValue('中文输入中的草稿');
    await app.evaluate(({ ipcMain }) => {
      const internals = ipcMain as unknown as { _invokeHandlers: Map<string, unknown> };
      (globalThis as unknown as { savedHandler: unknown }).savedHandler =
        internals._invokeHandlers.get('forge:snapshot');
      ipcMain.removeHandler('forge:snapshot');
      ipcMain.handle('forge:snapshot', () => ({
        ok: false,
        error: { code: 'UNAVAILABLE', message: 'fixture offline Core' },
      }));
    });
    await expect(page.getByText('Core 暂时不可用，当前草稿已保留。')).toBeVisible({ timeout: 12000 });
    await expect(page.getByLabel('任务标题')).toHaveValue('中文输入中的草稿');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('forge:snapshot');
      ipcMain.handle(
        'forge:snapshot',
        (globalThis as unknown as { savedHandler: Parameters<typeof ipcMain.handle>[1] }).savedHandler,
      );
    });
    await page.getByRole('button', { name: '重新连接 Core' }).click();
    await expect(page.getByText('Core 暂时不可用，当前草稿已保留。')).toHaveCount(0);
    await page.getByRole('button', { name: '保存任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '中文输入中的草稿', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 700));
    await page.evaluate(() => document.documentElement.style.setProperty('--font-size', '24px'));
    await page.getByRole('button', { name: '中文输入中的草稿', exact: true }).click();
    await page.getByLabel('任务标题').fill('长内容中文'.repeat(40));
    await expect(page.getByLabel('任务标题')).toHaveValue('长内容中文'.repeat(40));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/m1-narrow.png' });
  } finally {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      })
      .catch(() => {});
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

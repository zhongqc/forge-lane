import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
test('M1: offline board, drafts, dependencies, manual/group acceptance, filters, archive and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-board-'));
  const repo = join(dir, '仓库');
  execFileSync('/usr/bin/git', ['init', '-b', 'main', repo]);
  const launch = () =>
    electron.launch({
      executablePath: process.env.FORGE_PACKAGED_EXE || undefined,
      args: [
        ...(process.env.FORGE_PACKAGED_EXE ? [] : [resolve('.')]),
        `--forge-data-dir=${join(dir, 'data')}`,
      ],
      env: { ...process.env, PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '' },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByLabel('项目名称').fill('任务测试');
    await page.getByLabel('仓库路径').fill(repo);
    await page.getByRole('button', { name: '导入项目', exact: true }).click();
    await page.getByRole('button', { name: '打开任务看板' }).click();
    const create = async (title: string, kind: string) => {
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      await page.getByLabel('任务标题').fill(title);
      await page.getByLabel('任务类型').selectOption(kind);
    };
    await create('产品交付', 'GROUP');
    await page.getByRole('button', { name: '保存任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '产品交付', exact: true })).toBeVisible();
    await create('人工验收', 'MANUAL');
    await page.getByLabel('父任务组').selectOption({ label: '#1 产品交付 · Backlog' });
    await page.getByLabel('标签（逗号分隔）').fill('发布, 中文');
    await page
      .getByLabel('描述（Markdown）', { exact: true })
      .fill('# 验收说明\n<script>window.pwned=1</script>');
    await page.getByRole('button', { name: '预览 Markdown' }).click();
    await expect(page.getByRole('heading', { name: '验收说明' })).toBeVisible();
    expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
    await page.getByRole('button', { name: '保存任务', exact: true }).click();
    await page.getByRole('button', { name: '人工验收', exact: true }).click();
    await page.getByLabel('任务标题').fill('未保存草稿');
    await page.evaluate(() => {
      window.confirm = () => false;
    });
    await page.getByRole('button', { name: '关闭详情' }).click();
    await expect(page.getByLabel('任务标题')).toHaveValue('未保存草稿');
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: '取消编辑' }).click();
    await page.getByRole('button', { name: '人工验收', exact: true }).click();
    await page.getByRole('button', { name: '开始任务', exact: true }).click();
    await page.getByRole('button', { name: '人工验收', exact: true }).click();
    await page.getByRole('button', { name: '验收完成', exact: true }).click();
    await page.getByRole('button', { name: '产品交付', exact: true }).click();
    await page.getByRole('button', { name: '验收完成', exact: true }).click();
    await create('不能绕过的代码任务', 'CODE');
    await page.getByRole('button', { name: '保存任务', exact: true }).click();
    await page.getByRole('button', { name: '不能绕过的代码任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '开始任务', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '验收完成', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '关闭详情' }).click();
    await page.getByLabel('筛选标签').selectOption('发布');
    await expect(page.getByRole('button', { name: '人工验收', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '不能绕过的代码任务', exact: true })).toHaveCount(0);
    await page.getByLabel('筛选标签').selectOption('');
    await page.getByRole('button', { name: '人工验收', exact: true }).click();
    await page.getByRole('button', { name: '归档任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '人工验收', exact: true })).toHaveCount(0);
    await page.getByLabel('包含归档').check();
    await expect(page.getByRole('button', { name: '人工验收', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '项目设置', exact: true }).click();
    await page.getByLabel('项目描述').fill('本地项目描述');
    await page.getByRole('button', { name: '保存项目设置' }).click();
    await page.screenshot({ path: 'test-results/m1-board.png' });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: '打开任务看板' }).click();
    await expect(page.getByRole('button', { name: '产品交付', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '项目设置', exact: true }).click();
    await expect(page.getByLabel('项目描述')).toHaveValue('本地项目描述');
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

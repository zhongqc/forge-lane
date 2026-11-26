import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve('.');
async function launch(
  dataDirectory: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const env = { ...process.env, PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '', ...extraEnv };
  delete (env as Record<string, string | undefined>).ELECTRON_RUN_AS_NODE;
  return electron.launch({
    executablePath: process.env.FORGE_PACKAGED_EXE || undefined,
    args: [...(process.env.FORGE_PACKAGED_EXE ? [] : [root]), `--forge-data-dir=${dataDirectory}`],
    env,
  });
}
test('cold start without system Node, settings persistence, Git import and renderer isolation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-desktop-'));
  const repository = join(dir, '项目 repo');
  const dataDirectory = join(dir, '配置路径'.repeat(12));
  execFileSync('/usr/bin/git', ['init', '-b', 'main', repository]);
  let app: ElectronApplication | undefined;
  try {
    app = await launch(dataDirectory);
    let page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible();
    expect(await page.evaluate(() => typeof (globalThis as unknown as { require: unknown }).require)).toBe(
      'undefined',
    );
    await page.getByRole('button', { name: '设置与环境' }).click();
    await page.getByLabel('主题').selectOption('dark');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByRole('status')).toContainText('设置已保存');
    await page.getByRole('button', { name: '项目', exact: true }).click();
    await page.getByLabel('项目名称').fill('Desktop smoke');
    await page.getByLabel('仓库路径').fill(repository);
    await page.getByRole('button', { name: '导入项目', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Desktop smoke' })).toBeVisible();
    await app.close();
    app = await launch(dataDirectory);
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Desktop smoke' })).toBeVisible();
    await page.getByRole('button', { name: '设置与环境' }).click();
    await expect(page.getByLabel('主题')).toHaveValue('dark');
    const oldPid = await app.evaluate(
      ({ app }) => app.getAppMetrics().find((item) => item.name === 'Forge Core')!.pid,
    );
    await app.evaluate((_electron, pid) => process.kill(pid, 'SIGKILL'), oldPid);
    await expect.poll(() => page.evaluate(async () => (await window.forge.snapshot()).ok)).toBe(true);
    // Cancelling native close confirmation must leave Core usable and preserve edits.
    await page.getByLabel('主题').selectOption('light');
    // Electron resolves beforeunload through its native dialog handler, not CDP.
    page.on('dialog', () => {});
    await app.evaluate(({ app, dialog }) => {
      dialog.showMessageBoxSync = () => 0;
      app.quit();
    });
    await expect(page.getByLabel('主题')).toHaveValue('light');
    expect(await page.evaluate(async () => (await window.forge.snapshot()).ok)).toBe(true);
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    await page.getByRole('button', { name: '取消修改' }).click();
    await page.screenshot({ path: 'test-results/desktop-settings.png' });
    const current = page.url();
    await page.evaluate(() => {
      window.location.href = 'https://example.com';
    });
    await page.waitForTimeout(250);
    expect(page.url()).toBe(current);
  } finally {
    if (app) {
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBoxSync = () => 1;
        })
        .catch(() => undefined);
      await app.close();
    }
    await rm(dir, { recursive: true, force: true });
  }
});
test('corrupt storage opens maintenance without replacing the database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-corrupt-'));
  const data = join(dir, 'data');
  await mkdir(data);
  await writeFile(join(data, 'forge.sqlite'), 'preserve original corrupt bytes');
  let app: ElectronApplication | undefined;
  try {
    app = await launch(data);
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '需要维护' })).toBeVisible();
    expect(await readFile(join(data, 'forge.sqlite'), 'utf8')).toBe('preserve original corrupt bytes');
  } finally {
    if (app) {
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBoxSync = () => 1;
        })
        .catch(() => undefined);
      await app.close();
    }
    await rm(dir, { recursive: true, force: true });
  }
});
test('development renderer connects with canonical URL and development-only CSP', async () => {
  test.skip(!!process.env.FORGE_PACKAGED_EXE, 'Packaged application does not accept a development URL');
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { developmentCsp } = await import('../../apps/desktop/build/development-csp');
  const server = await createServer({
    configFile: false,
    root: resolve('apps/desktop/src/renderer'),
    plugins: [react(), developmentCsp()],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const dir = await mkdtemp(join(tmpdir(), 'forge-dev-'));
  let app: ElectronApplication | undefined;
  try {
    app = await launch(dir, { ELECTRON_RENDERER_URL: `http://127.0.0.1:${address.port}` });
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '项目工作台' })).toBeVisible();
    expect(await page.evaluate(async () => (await window.forge.snapshot()).ok)).toBe(true);
  } finally {
    await app?.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

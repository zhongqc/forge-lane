import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('upgrades an M0 database in the actual application and preserves project/settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-upgrade-'));
  const data = join(dir, 'data');
  await mkdir(data);
  const db = join(data, 'forge.sqlite');
  await writeFile(db, '');
  const migrations = join(dir, 'migrations');
  await mkdir(migrations);
  await cp(
    resolve('packages/local-db/prisma/migrations/202611250001_initial'),
    join(migrations, '202611250001_initial'),
    { recursive: true },
  );
  await writeFile(join(migrations, 'migration_lock.toml'), 'provider = "sqlite"\n');
  const config = join(dir, 'initial.config.ts');
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: resolve('packages/local-db/prisma/schema.prisma'), migrations: { path: migrations }, datasource: { url: `file:${db}` } })}`,
  );
  execFileSync(
    require('electron'),
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' },
  );
  const repo = join(dir, 'repo');
  execFileSync('/usr/bin/git', ['init', '-b', 'main', repo]);
  const id = crypto.randomUUID();
  execFileSync('/usr/bin/sqlite3', [
    db,
    `INSERT INTO Project(id,name,repositoryPath,gitCommonDir) VALUES('${id}','M0 保留项目','${repo}','${repo}/.git'); INSERT INTO Settings(id,version,"values") VALUES('global',3,'{"theme":"dark","fontSize":18,"gitPath":"","ghPath":"","codexPath":""}');`,
  ]);
  const app = await electron.launch({
    executablePath: process.env.FORGE_PACKAGED_EXE || undefined,
    args: [...(process.env.FORGE_PACKAGED_EXE ? [] : [resolve('.')]), `--forge-data-dir=${data}`],
    env: { ...process.env, PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '' },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'M0 保留项目' })).toBeVisible();
    await page.getByRole('button', { name: '打开任务看板' }).click();
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByLabel('任务标题').fill('升级后创建');
    await page.getByRole('button', { name: '保存任务', exact: true }).click();
    await expect(page.getByRole('button', { name: '升级后创建', exact: true })).toBeVisible();
    expect(
      await page.evaluate(async () => {
        const r = await window.forge.snapshot();
        return r.ok ? r.data.settings.values.fontSize : null;
      }),
    ).toBe(18);
    expect((await readdir(data)).some((n) => n.includes('backup'))).toBe(true);
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

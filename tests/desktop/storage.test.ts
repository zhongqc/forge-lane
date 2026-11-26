import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { openStore } from '../../packages/local-db/src/store';
import { inspectDatabase, backupDatabase, createDatabaseFile } from '../../packages/local-db/src/maintenance';
import { CoreService } from '../../packages/core/src/service';
import { defaultSettings } from '../../packages/contracts/src/index';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const migrations = resolve('packages/local-db/prisma/migrations');
async function database() {
  const dir = await mkdtemp(join(tmpdir(), 'forge 中文 '));
  dirs.push(dir);
  const path = join(dir, 'forge.sqlite');
  expect(inspectDatabase(path, migrations)).toEqual({ pending: true, exists: false });
  createDatabaseFile(path);
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      'packages/local-db/prisma.config.ts',
    ],
    { env: { ...process.env, FORGE_DATABASE_URL: `file:${path}`, CHECKPOINT_DISABLE: '1' }, stdio: 'pipe' },
  );
  return { dir, path };
}
it('persists projects/settings, replays mutations and rejects stale writes without extra events', async () => {
  const { path, dir } = await database();
  let store = await openStore(path);
  const core = new CoreService(
    store,
    {
      inspectRepository: async () => ({ repositoryPath: '/repo', gitCommonDir: '/repo/.git' }),
      checkEnvironment: async () => [],
    },
    dir,
  );
  const command = { method: 'project.import', requestId: crypto.randomUUID(), name: 'Forge', path: '/repo' };
  const first = await core.execute(command);
  expect(await core.execute(command)).toEqual(first);
  await expect(core.execute({ ...command, name: 'Different' })).rejects.toMatchObject({
    code: 'REQUEST_REUSED',
  });
  await expect(core.execute({ ...command, requestId: crypto.randomUUID() })).rejects.toMatchObject({
    code: 'DUPLICATE_REPOSITORY',
  });
  const settings = {
    method: 'settings.save',
    requestId: crypto.randomUUID(),
    expectedVersion: 1,
    values: { ...defaultSettings, theme: 'dark' },
  };
  expect(await core.execute(settings)).toMatchObject({ version: 2, values: { theme: 'dark' } });
  await expect(core.execute({ ...settings, requestId: crypto.randomUUID() })).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  await expect(
    core.execute({ ...settings, values: { ...defaultSettings, fontSize: 0 } }),
  ).rejects.toBeDefined();
  await store.close();
  store = await openStore(path);
  try {
    expect(await store.snapshot()).toMatchObject({
      projects: [{ name: 'Forge' }],
      settings: { version: 2, values: { theme: 'dark' } },
    });
    const db = new Database(path, { readonly: true });
    expect(db.prepare('SELECT count(*) AS n FROM ActivityEvent').get()).toEqual({ n: 2 });
    db.close();
    expect(await store.diagnostics()).toEqual({ foreignKeys: 1, journalMode: 'wal', busyTimeout: 5000 });
  } finally {
    await store.close();
  }
});
it('preserves WAL data in backup and refuses unknown, failed or changed migration histories', async () => {
  const { path, dir } = await database();
  expect(inspectDatabase(path, migrations).pending).toBe(false);
  const store = await openStore(path);
  await store.saveSettings({
    requestId: crypto.randomUUID(),
    expectedVersion: 1,
    values: { ...defaultSettings, theme: 'dark' },
  });
  const backup = join(dir, 'backup.sqlite');
  await backupDatabase(path, backup);
  await store.close();
  const restored = await openStore(backup);
  expect((await restored.snapshot()).settings.values.theme).toBe('dark');
  await restored.close();
  const db = new Database(path);
  db.prepare('UPDATE _prisma_migrations SET finished_at = NULL').run();
  expect(() => inspectDatabase(path, migrations)).toThrow(/未完成/);
  db.prepare(
    "UPDATE _prisma_migrations SET finished_at = CURRENT_TIMESTAMP, migration_name = 'future_schema'",
  ).run();
  expect(() => inspectDatabase(path, migrations)).toThrow(/较新|未知/);
  db.prepare("UPDATE _prisma_migrations SET migration_name = '202611250001_initial', checksum = 'bad'").run();
  db.close();
  expect(() => inspectDatabase(path, migrations)).toThrow(/校验/);
  expect((await readFile(path)).byteLength).toBeGreaterThan(0);
  const corrupt = join(dir, 'corrupt.sqlite');
  await writeFile(corrupt, 'not a database');
  expect(() => inspectDatabase(corrupt, migrations)).toThrow();
  expect(await readFile(corrupt, 'utf8')).toBe('not a database');
  const next = join(dir, 'migrations');
  await mkdir(next);
  // An existing app DB must never be accepted by an app with no known migrations.
  expect(() => inspectDatabase(backup, next)).toThrow();
});
it('replays a committed import even when repository inspection is no longer available', async () => {
  const { path, dir } = await database();
  const store = await openStore(path);
  let available = true;
  const core = new CoreService(
    store,
    {
      inspectRepository: async () => {
        if (!available) throw new Error('Repository moved');
        return { repositoryPath: '/repo', gitCommonDir: '/repo/.git' };
      },
      checkEnvironment: async () => [],
    },
    dir,
  );
  const input = { method: 'project.import', requestId: crypto.randomUUID(), name: 'Replay', path: '/repo' };
  try {
    const saved = await core.execute(input);
    available = false;
    expect(await core.execute(input)).toEqual(saved);
  } finally {
    await store.close();
  }
});
it('upgrades a newer app schema without losing settings and retains failed migration evidence', async () => {
  const { path, dir } = await database();
  const store = await openStore(path);
  await store.saveSettings({
    requestId: crypto.randomUUID(),
    expectedVersion: 1,
    values: { ...defaultSettings, fontSize: 18 },
  });
  await store.close();
  const { cp } = await import('node:fs/promises');
  const next = join(dir, 'next-migrations');
  await cp(migrations, next, { recursive: true });
  const v2 = join(next, '209901010001_probe');
  await mkdir(v2);
  await writeFile(
    join(v2, 'migration.sql'),
    'CREATE TABLE "UpgradeProbe" ("id" TEXT NOT NULL PRIMARY KEY);\n',
  );
  expect(inspectDatabase(path, next).pending).toBe(true);
  await backupDatabase(path, join(dir, 'before-upgrade.sqlite'));
  const config = join(dir, 'next.config.ts');
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: resolve('packages/local-db/prisma/schema.prisma'), migrations: { path: next }, datasource: { url: `file:${path}` } })}`,
  );
  const deploy = () =>
    execFileSync(
      process.execPath,
      [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config],
      { env: { ...process.env, CHECKPOINT_DISABLE: '1' }, stdio: 'pipe' },
    );
  deploy();
  deploy();
  expect(inspectDatabase(path, next).pending).toBe(false);
  expect(() => inspectDatabase(path, migrations)).toThrow(/较新|未知/);
  const upgraded = await openStore(path);
  expect((await upgraded.snapshot()).settings.values.fontSize).toBe(18);
  await upgraded.close();
  const v3 = join(next, '209901010002_broken');
  await mkdir(v3);
  await writeFile(join(v3, 'migration.sql'), 'INVALID SQL;');
  expect(deploy).toThrow();
  expect(() => inspectDatabase(path, next)).toThrow(/未完成/);
  const preserved = new Database(path, { readonly: true });
  expect(preserved.prepare('SELECT version FROM Settings').get()).toEqual({ version: 2 });
  preserved.close();
});

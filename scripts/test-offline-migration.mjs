// Probe the packaged migration/SQLite path under a real macOS network deny policy.
// The driver uses Node; every application/Prisma process uses the bundled Electron binary.
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, cp, readdir, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const executable = resolve(
  process.env.FORGE_PACKAGED_EXE ?? 'release/mac-arm64/Forge Desktop.app/Contents/MacOS/Forge Desktop',
);
const app = resolve(dirname(executable), '../Resources/app');
const root = await mkdtemp(join(tmpdir(), 'forge-offline-migration-'));
const run = (args, extra = {}) =>
  execFileSync(
    '/usr/bin/sandbox-exec',
    ['-p', '(version 1)(allow default)(deny network-outbound)', executable, ...args],
    {
      env: {
        PATH: '/usr/bin:/bin',
        HOME: process.env.HOME,
        TMPDIR: root,
        ELECTRON_RUN_AS_NODE: '1',
        CHECKPOINT_DISABLE: '1',
        ...extra,
      },
      stdio: 'pipe',
      timeout: 60000,
    },
  ).toString();
const migrate = (data) => run([join(app, 'out/main/migrate.cjs'), data, app, executable]);
try {
  const cold = join(root, 'cold');
  migrate(cold);
  migrate(cold);
  console.log('PASS packaged cold migration and repeat; no network or PATH Node');
  const old = join(root, 'old'),
    migrations = join(root, 'initial');
  await mkdir(old);
  await mkdir(migrations);
  await cp(
    join(app, 'packages/local-db/prisma/migrations/202611250001_initial'),
    join(migrations, '202611250001_initial'),
    { recursive: true },
  );
  await writeFile(join(migrations, 'migration_lock.toml'), 'provider = "sqlite"\n');
  const database = join(old, 'forge.sqlite');
  await writeFile(database, '');
  const config = join(root, 'initial.config.ts');
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: join(app, 'packages/local-db/prisma/schema.prisma'), migrations: { path: migrations }, datasource: { url: `file:${database}` } })}`,
  );
  run([join(app, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config]);
  const query = `const {createRequire}=require('node:module');const r=createRequire(${JSON.stringify(join(app, 'package.json'))});const db=new (r('better-sqlite3'))(${JSON.stringify(database)});`;
  run([
    '-e',
    query +
      `db.prepare('INSERT INTO Settings(id,version,"values") VALUES(?,?,?)').run('global',7,JSON.stringify({theme:'dark',fontSize:18,gitPath:'',ghPath:'',codexPath:''}));db.close();`,
  ]);
  migrate(old);
  migrate(old);
  assert.ok((await readdir(join(old, 'backups'))).length > 0);
  const result = JSON.parse(
    run([
      '-e',
      query +
        `console.log(JSON.stringify({version:db.prepare('SELECT version FROM Settings').get().version,tasks:db.prepare('SELECT COUNT(*) AS n FROM Task').get().n,migrations:db.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL').get().n}));db.close();`,
    ]),
  );
  assert.equal(result.version, 7);
  assert.equal(result.tasks, 0);
  assert.equal(result.migrations, 3);
  console.log('PASS packaged M0 upgrade, backup, preserved settings and repeat; network denied');
} finally {
  await rm(root, { recursive: true, force: true });
}

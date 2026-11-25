import { mkdir, appendFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../../../packages/adapters/src/process';
import { createRequire } from 'node:module';
import {
  inspectDatabase,
  backupDatabase,
  createDatabaseFile,
} from '../../../../packages/local-db/src/maintenance';

const cancellation = new AbortController();
process.parentPort?.on('message', ({ data }: { data: { type?: string } }) => {
  if (data.type === 'shutdown') cancellation.abort();
});

async function main() {
  const [dataDirectory, appDirectory, electronExecutable] = process.argv.slice(2);
  if (!dataDirectory || !appDirectory) throw new Error('Missing migration paths');
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await chmod(dataDirectory, 0o700);
  const database = join(dataDirectory, 'forge.sqlite');
  const migrations = join(appDirectory, 'packages/local-db/prisma/migrations');
  const state = inspectDatabase(database, migrations);
  if (!state.pending) {
    process.exit(0);
  }
  if (state.exists) {
    const backups = join(dataDirectory, 'backups');
    await mkdir(backups, { recursive: true, mode: 0o700 });
    await backupDatabase(database, join(backups, `before-migration-${Date.now()}.sqlite`));
  }
  createDatabaseFile(database);
  process.env.FORGE_DATABASE_URL = `file:${database}`;
  process.env.CHECKPOINT_DISABLE = '1';
  process.env.PRISMA_HIDE_UPDATE_MESSAGE = '1';
  const require = createRequire(join(appDirectory, 'package.json'));
  const cli = require.resolve('prisma/build/index.js');
  // Electron utility hosts keep a parent port alive. Run the public CLI bin in
  // bundled Electron's Node mode so completion is its actual process exit status.
  const result = await runCommand(
    electronExecutable,
    [cli, 'migrate', 'deploy', '--config', join(appDirectory, 'packages/local-db/prisma.config.ts')],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeoutMs: 55000,
      maxBytes: 128 * 1024,
      signal: cancellation.signal,
      onSpawn: (pid) => process.parentPort?.postMessage({ type: 'process-started', pid }),
    },
  );
  process.parentPort?.postMessage({ type: 'process-ended' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.code);
}
main().catch(async (error: unknown) => {
  process.parentPort?.postMessage({ type: 'process-ended' });
  const message = error instanceof Error ? error.message : 'Database startup failed';
  process.parentPort?.postMessage({ type: 'failure', message });
  const dataDirectory = process.argv[2];
  if (dataDirectory)
    await appendFile(join(dataDirectory, 'startup-error.log'), `${new Date().toISOString()} ${message}\n`, {
      mode: 0o600,
    }).catch(() => undefined);
  process.exit(1);
});

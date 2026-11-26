import { checkProject } from '../../../../packages/adapters/src/project-check';
import { join } from 'node:path';
import { CoreService } from '../../../../packages/core/src/service';
import { openStore } from '../../../../packages/local-db/src/store';
import { inspectDatabase } from '../../../../packages/local-db/src/maintenance';
import { errorReply } from '../../../../packages/contracts/src/index';
import { inspectRepository } from '../../../../packages/adapters/src/git';
import { checkEnvironment } from '../../../../packages/adapters/src/process';
import { socketPath } from '../../../../packages/adapters/src/socket-path.mjs';
import { startLocalServer } from '../../../../packages/adapters/src/local-rpc';

async function main() {
  const [dataDirectory, appDirectory] = process.argv.slice(2);
  const database = join(dataDirectory, 'forge.sqlite');
  if (inspectDatabase(database, join(appDirectory, 'packages/local-db/prisma/migrations')).pending)
    throw new Error('数据库迁移尚未完成');
  const store = await openStore(database);
  const core = new CoreService(store, { inspectRepository, checkEnvironment, checkProject }, dataDirectory);
  let rpc: Awaited<ReturnType<typeof startLocalServer>>;
  try {
    rpc = await startLocalServer(await socketPath(dataDirectory, true));
  } catch (error) {
    await store.close();
    throw error;
  }
  let stopping = false;
  const inflight = new Set<Promise<void>>();
  process.parentPort?.on('message', ({ data }: { data: { id: string; command: unknown; type?: string } }) => {
    if (data.type === 'shutdown') {
      if (stopping) return;
      stopping = true;
      void (async () => {
        await rpc.close();
        await Promise.allSettled([...inflight]);
        await store.close();
        process.exit(0);
      })();
      return;
    }
    if (stopping) return;
    const work = (async () => {
      try {
        process.parentPort?.postMessage({
          id: data.id,
          reply: { ok: true, data: await core.execute(data.command) },
        });
      } catch (error) {
        process.parentPort?.postMessage({ id: data.id, reply: errorReply(error) });
      }
    })();
    inflight.add(work);
    void work.finally(() => inflight.delete(work));
  });
  process.parentPort?.postMessage({ type: 'ready' });
}
main().catch((error: unknown) => {
  process.parentPort?.postMessage({
    type: 'failure',
    message: error instanceof Error ? error.message : 'Core failed',
  });
  process.exitCode = 1;
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue } from '../../packages/shared/src/serial-queue.ts';
void test('same issue writes run serially and a failed write does not block the next', async () => {
  const q = new SerialQueue();
  const events: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const first = q
    .run('issue', async () => {
      events.push('first');
      await hold;
      throw new Error('network');
    })
    .catch(() => {});
  const next = q.run('issue', async () => {
    events.push('next');
    return 2;
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first']);
  release();
  await first;
  assert.equal(await next, 2);
  assert.deepEqual(events, ['first', 'next']);
});

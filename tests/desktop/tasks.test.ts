import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { openStore } from '../../packages/local-db/src/store';
import { createDatabaseFile } from '../../packages/local-db/src/maintenance';
import { CoreService } from '../../packages/core/src/service';
import type { Task, Board, TaskDetail } from '../../packages/contracts/src/tasks';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'forge-tasks-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'db.sqlite');
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
    { env: { ...process.env, FORGE_DATABASE_URL: `file:${path}` }, stdio: 'pipe' },
  );
  const store = await openStore(path);
  cleanup.push(() => store.close());
  const core = new CoreService(
    store,
    {
      inspectRepository: async (path) => ({ repositoryPath: path, gitCommonDir: `${path}/.git` }),
      checkEnvironment: async () => [],
    },
    dir,
  );
  const p = (await core.execute({
    method: 'project.import',
    requestId: crypto.randomUUID(),
    name: '中文项目',
    path: '/repo',
  })) as { id: string };
  const create = (title: string, more: Record<string, unknown> = {}) =>
    core.execute({
      method: 'task.create',
      requestId: crypto.randomUUID(),
      projectId: p.id,
      kind: 'MANUAL',
      status: 'Backlog',
      title,
      description: '',
      acceptanceCriteria: '',
      labels: [],
      priority: 'MEDIUM',
      parentId: null,
      parentVersions: {},
      dependencies: [],
      ...more,
    }) as Promise<Task>;
  const action = (t: Task, a: string) =>
    core.execute({
      method: 'task.action',
      taskId: t.id,
      expectedVersion: t.version,
      requestId: crypto.randomUUID(),
      action: a,
    }) as Promise<Task>;
  const detail = (id: string) => core.execute({ method: 'task.detail', taskId: id }) as Promise<TaskDetail>;
  return { core, p, create, action, detail, store, path };
}
it('completes manual/group flow with immutable revisions, idempotency, events and stale guards', async () => {
  const { core, p, create, action, detail } = await fixture();
  const g = await create('组', { kind: 'GROUP', status: 'Todo' });
  expect(g.status).toBe('Backlog');
  let task = await create('一样的标题', { parentId: g.id, parentVersions: { [g.id]: g.version } });
  expect(task.number).toBe(2);
  const copy = await create('一样的标题');
  expect(copy.number).toBe(3);
  const command = {
    method: 'task.update',
    requestId: crypto.randomUUID(),
    taskId: task.id,
    expectedVersion: task.version,
    title: '新要求',
    description: '描述',
    acceptanceCriteria: '通过人工检查',
    labels: ['tag'],
    priority: 'HIGH',
    parentId: g.id,
    parentVersions: {},
    dependencies: [],
  };
  task = (await core.execute(command)) as Task;
  expect(await core.execute(command)).toEqual(task);
  await expect(core.execute({ ...command, requestId: crypto.randomUUID() })).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  const revision = task.requirementRevisionId;
  task = (await core.execute({
    ...command,
    requestId: crypto.randomUUID(),
    expectedVersion: task.version,
    labels: ['tag2'],
  })) as Task;
  expect(task.requirementRevisionId).toBe(revision);
  expect((await detail(task.id)).revisions).toHaveLength(2);
  task = await action(task, 'start');
  task = await action(task, 'accept');
  expect(task.status).toBe('Done');
  let group = (await detail(g.id)).task;
  expect(group.status).toBe('Todo');
  group = await action(group, 'accept');
  expect(group.status).toBe('Done');
  await expect(action(task, 'start')).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' });
  expect((await detail(task.id)).activities).toHaveLength(5);
  await action(task, 'archive');
  const board = (await core.execute({ method: 'task.board', projectId: p.id })) as Board;
  expect(board.tasks.find((t) => t.id === task.id)?.archived).toBe(true);
  expect(board.eventCursor).toBeGreaterThan(0);
});
it('serializes cyclic dependency races and rejects cross project links and stale parents', async () => {
  const { core, create, detail } = await fixture();
  const a = await create('A'),
    b = await create('B'),
    g = await create('G', { kind: 'GROUP' });
  const update = (t: Task, other: Task, more: Record<string, unknown> = {}) =>
    core.execute({
      method: 'task.update',
      requestId: crypto.randomUUID(),
      taskId: t.id,
      expectedVersion: t.version,
      title: t.title,
      description: t.description,
      acceptanceCriteria: t.acceptanceCriteria,
      labels: [],
      priority: t.priority,
      parentId: null,
      parentVersions: {},
      dependencies: [other.id],
      ...more,
    });
  const results = await Promise.allSettled([update(a, b), update(b, a)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(
    update((await detail(a.id)).task, b, {
      parentId: g.id,
      parentVersions: { [g.id]: 99 },
      dependencies: [],
    }),
  ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  const p2 = (await core.execute({
    method: 'project.import',
    requestId: crypto.randomUUID(),
    name: '其他',
    path: '/other',
  })) as { id: string };
  const foreign = await create('foreign', { projectId: p2.id });
  expect(foreign.number).toBe(1);
  await expect(update((await detail(a.id)).task, foreign)).rejects.toMatchObject({
    code: 'INVALID_RELATION',
  });
});
it('gates CODE actions, dependency start, group cancellation, sorting and active dependency changes', async () => {
  const { core, create, action, detail } = await fixture();
  const code = await create('代码', { kind: 'CODE' });
  await expect(action(code, 'accept')).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' });
  await expect(action(code, 'start')).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' });
  const dep = await create('依赖');
  let manual = await create('人工', { dependencies: [dep.id] });
  await expect(action(manual, 'start')).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' });
  await action(await action(dep, 'start'), 'accept');
  manual = await action(manual, 'start');
  expect(manual.status).toBe('In Progress');
  const g = await create('组', { kind: 'GROUP' });
  const child = await create('子任务', { parentId: g.id, parentVersions: { [g.id]: g.version } });
  await action(child, 'start');
  await expect(action((await detail(g.id)).task, 'cancel')).rejects.toMatchObject({
    code: 'ACTION_NOT_ALLOWED',
  });
  const one = await create('one'),
    two = await create('two');
  await core.execute({
    method: 'task.reorder',
    requestId: crypto.randomUUID(),
    taskId: one.id,
    expectedVersion: one.version,
    targetId: two.id,
    targetVersion: two.version,
  });
  expect((await detail(one.id)).task.position).toBe(two.position);
});
it('can detach a cancelled child for group acceptance and recover pending children from cancelled groups', async () => {
  const { core, create, action, detail } = await fixture();
  const g = await create('组', { kind: 'GROUP' });
  let c = await create('取消项', { parentId: g.id, parentVersions: { [g.id]: g.version } });
  c = await action(c, 'cancel');
  await expect(action(c, 'archive')).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' });
  let parent = (await detail(g.id)).task;
  await core.execute({
    method: 'task.reparent',
    requestId: crypto.randomUUID(),
    taskId: c.id,
    expectedVersion: c.version,
    parentId: null,
    parentVersions: { [g.id]: parent.version },
  });
  expect((await detail(g.id)).task.status).toBe('Backlog');
  expect((await detail(c.id)).task.status).toBe('Cancelled');
  parent = (await detail(g.id)).task;
  const child = await create('继续工作', { parentId: g.id, parentVersions: { [g.id]: parent.version } });
  parent = await action((await detail(g.id)).task, 'cancel');
  await core.execute({
    method: 'task.reparent',
    requestId: crypto.randomUUID(),
    taskId: child.id,
    expectedVersion: child.version,
    parentId: null,
    parentVersions: { [g.id]: parent.version },
  });
  expect((await detail(child.id)).task.parentId).toBe(null);
});
it('persists only config-matched diagnostics and invalidates them on settings change', async () => {
  const { core, store, path } = await fixture();
  await core.execute({ method: 'environment.check' });
  expect(
    ((await core.execute({ method: 'snapshot' })) as { environmentChecks: unknown }).environmentChecks,
  ).toEqual([]);
  const { defaultSettings } = await import('../../packages/contracts/src/index');
  await core.execute({
    method: 'settings.save',
    requestId: crypto.randomUUID(),
    expectedVersion: 1,
    values: { ...defaultSettings, fontSize: 18 },
  });
  expect(
    ((await core.execute({ method: 'snapshot' })) as { environmentChecks: unknown }).environmentChecks,
  ).toBeNull();
  await core.execute({ method: 'environment.check' });
  await store.close();
  const reopened = await openStore(path);
  try {
    expect(await reopened.readDiagnostic('environment', '2')).toEqual([]);
  } finally {
    await reopened.close();
  }
});

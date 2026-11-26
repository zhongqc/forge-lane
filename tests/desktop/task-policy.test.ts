import { expect, it } from 'vitest';
import { taskCreateSchema } from '../../packages/contracts/src/tasks';
import { allowedActions, validateLinks, groupStatus } from '../../packages/core/src/task-policy';
const base = {
  id: 'a',
  projectId: 'p',
  kind: 'MANUAL',
  status: 'Todo',
  archived: false,
  parentId: null,
  dependencies: [],
} as const;
it('validates task text boundaries and creation states', () => {
  const input = {
    method: 'task.create',
    requestId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    kind: 'CODE',
    title: ' 中文 ',
    description: '',
    acceptanceCriteria: '',
    priority: 'MEDIUM',
    labels: [],
    dependencies: [],
    parentId: null,
    parentVersions: {},
    status: 'Backlog',
  };
  expect(taskCreateSchema.parse(input).title).toBe('中文');
  for (const change of [
    { title: ' ' },
    { title: 'a'.repeat(201) },
    { description: 'a'.repeat(200001) },
    { acceptanceCriteria: 'a'.repeat(20001) },
    { status: 'Done' },
  ])
    expect(taskCreateSchema.safeParse({ ...input, ...change }).success).toBe(false);
});
it('blocks CODE execution/completion and terminal edits; manual acceptance needs a start', () => {
  const code = { ...base, kind: 'CODE' };
  expect(allowedActions(code, []).start.allowed).toBe(false);
  expect(allowedActions(code, []).accept.allowed).toBe(false);
  expect(allowedActions(base, []).accept.allowed).toBe(false);
  expect(allowedActions({ ...base, status: 'In Progress' }, []).accept.allowed).toBe(true);
  expect(allowedActions({ ...base, status: 'Done' }, []).edit.allowed).toBe(false);
});
it('rejects cycles, cross-project links, group dependencies and nested parents', () => {
  const b = { ...base, id: 'b', dependencies: ['a'] };
  expect(() => validateLinks({ ...base, dependencies: ['b'] }, [base, b])).toThrow(/循环/);
  expect(() => validateLinks({ ...base, dependencies: ['b'] }, [base, { ...b, projectId: 'q' }])).toThrow();
  expect(() => validateLinks({ ...base, dependencies: ['b'] }, [base, { ...b, kind: 'GROUP' }])).toThrow();
  expect(() =>
    validateLinks({ ...base, kind: 'GROUP', parentId: 'b' }, [base, { ...b, kind: 'GROUP' }]),
  ).toThrow();
});
it('aggregates groups, blocks cancelled children and requires explicit group acceptance', () => {
  const group = { ...base, kind: 'GROUP' };
  expect(groupStatus([])).toBe('Backlog');
  expect(groupStatus([{ ...base, status: 'Done' }])).toBe('Todo');
  expect(groupStatus([{ ...base, status: 'In Progress' }])).toBe('In Progress');
  expect(
    allowedActions(group, [{ ...base, id: 'child', parentId: 'a', status: 'Cancelled' }]).accept.allowed,
  ).toBe(false);
  expect(
    allowedActions(group, [{ ...base, id: 'child', parentId: 'a', status: 'Done' }]).accept.allowed,
  ).toBe(true);
});

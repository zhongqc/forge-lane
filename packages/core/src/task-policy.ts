import { ForgeError } from '../../contracts/src/index';
import type { AllowedActions } from '../../contracts/src/tasks';
export type PolicyTask = {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  parentId: string | null;
  archived: boolean;
  dependencies: readonly string[];
};
const active = (t: PolicyTask) => ['In Progress', 'In Review', 'Ready to Merge'].includes(t.status);
export const terminal = (t: { status: string }) => ['Done', 'Cancelled'].includes(t.status);
export function groupStatus(children: PolicyTask[]) {
  return children.length === 0 ? 'Backlog' : children.some(active) ? 'In Progress' : 'Todo';
}
export function blockedReasons(task: PolicyTask, all: PolicyTask[]): string[] {
  return task.dependencies
    .filter((id) => all.find((t) => t.id === id)?.status !== 'Done')
    .map((id) => `依赖未完成：${id}`);
}
export function allowedActions(task: PolicyTask, all: PolicyTask[]): AllowedActions {
  const end = terminal(task) || task.archived;
  const children = all.filter((t) => t.parentId === task.id);
  const ready = blockedReasons(task, all).length === 0;
  const pending = ['Backlog', 'Todo'].includes(task.status);
  const rule = (allowed: boolean, reason: string) => ({
    allowed: !end && allowed,
    reason: end ? '已完成、取消或归档的任务不可修改' : allowed ? '' : reason,
  });
  return {
    edit: rule(true, ''),
    reparent: {
      allowed:
        task.kind !== 'GROUP' && !task.archived && all.find((t) => t.id === task.parentId)?.status !== 'Done',
      reason: '只允许调整叶子任务的成员关系；已完成的任务组保持不变',
    },
    backlog: rule(task.kind !== 'GROUP' && task.status === 'Todo', '仅待办叶子任务可移回 Backlog'),
    todo: rule(task.kind !== 'GROUP' && task.status === 'Backlog', '仅 Backlog 叶子任务可移到 Todo'),
    start: rule(
      task.kind === 'MANUAL' && pending && ready,
      task.kind === 'CODE'
        ? '自动执行未开放：M0 隔离门禁未通过，M2 尚未实现'
        : !ready
          ? '依赖尚未全部完成'
          : '仅待办人工任务可开始',
    ),
    accept: rule(
      ready &&
        ((task.kind === 'MANUAL' && task.status === 'In Progress') ||
          (task.kind === 'GROUP' && children.length > 0 && children.every((t) => t.status === 'Done'))),
      '人工任务须先开始且依赖完成；任务组须有子任务且全部 Done',
    ),
    cancel: rule(task.kind !== 'GROUP' || !children.some(active), '任务组仍有活动子任务，不能取消'),
    archive: {
      allowed: terminal(task) && !task.archived && !(task.status === 'Cancelled' && task.parentId !== null),
      reason:
        task.status === 'Cancelled' && task.parentId !== null
          ? '请先移出任务组，避免阻塞组验收'
          : terminal(task)
            ? task.archived
              ? '已归档'
              : ''
            : '仅完成或取消的任务可归档',
    },
    reorder: rule(true, ''),
  };
}
export function validateLinks(task: PolicyTask, all: PolicyTask[]) {
  const fail = (message: string): never => {
    throw new ForgeError('INVALID_RELATION', message);
  };
  if (task.parentId) {
    const parent = all.find((t) => t.id === task.parentId);
    if (
      task.kind === 'GROUP' ||
      !parent ||
      parent.projectId !== task.projectId ||
      parent.kind !== 'GROUP' ||
      (terminal(parent) &&
        !(parent.status === 'Cancelled' && all.find((t) => t.id === task.id)?.parentId === parent.id)) ||
      (parent.archived && all.find((t) => t.id === task.id)?.parentId !== parent.id)
    )
      fail('父任务必须是同项目中未结束的任务组，且只允许一层');
  }
  if (task.kind === 'GROUP' && task.dependencies.length) fail('任务组不能作为依赖端点');
  for (const id of task.dependencies) {
    const dep = all.find((t) => t.id === id);
    if (
      id === task.id ||
      !dep ||
      dep.projectId !== task.projectId ||
      dep.kind === 'GROUP' ||
      (dep.archived && dep.status !== 'Done')
    )
      fail('依赖必须是同项目的其他叶子任务');
  }
  const graph = new Map(all.map((t) => [t.id, t.dependencies]));
  graph.set(task.id, task.dependencies);
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail('依赖形成循环');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  visit(task.id);
}

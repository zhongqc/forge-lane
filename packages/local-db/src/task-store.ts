import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/client';
import { ForgeError } from '../../contracts/src/index';
import type { Board, Task, TaskCommand, TaskDetail, TaskStatus, TaskKind } from '../../contracts/src/tasks';
import {
  allowedActions,
  blockedReasons,
  groupStatus,
  terminal,
  validateLinks,
} from '../../core/src/task-policy';
type Tx = Prisma.TransactionClient;
export type Mutate = <T>(
  requestId: string,
  input: unknown,
  work: (tx: Tx) => Promise<{ result: T; entityId: string; type: string }>,
) => Promise<T>;
const conflict = () => new ForgeError('VERSION_CONFLICT', '内容已变化，请加载最新版本后比较；当前输入已保留');
const missing = () => new ForgeError('NOT_FOUND', '项目或任务不存在');
async function tasks(tx: Tx, projectId: string): Promise<Task[]> {
  const [rows, edges] = await Promise.all([
    tx.task.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { number: 'asc' }] }),
    tx.taskDependency.findMany({ where: { projectId } }),
  ]);
  const data = rows.map((t) => ({
    ...t,
    kind: t.kind as TaskKind,
    status: t.status as TaskStatus,
    priority: t.priority as Task['priority'],
    labels: t.labels as string[],
    dependencies: edges
      .filter((e) => e.taskId === t.id)
      .map((e) => e.dependsOnId)
      .sort(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
  return data.map((t) => ({
    ...t,
    allowedActions: allowedActions(t, data),
    blockedReasons: blockedReasons(t, data),
    progress: {
      done: data.filter((c) => c.parentId === t.id && c.status === 'Done').length,
      total: data.filter((c) => c.parentId === t.id).length,
    },
  }));
}
async function refreshParents(tx: Tx, ids: Array<string | null>) {
  for (const id of new Set(ids.filter((v): v is string => v !== null))) {
    const parent = await tx.task.findUniqueOrThrow({ where: { id } });
    if (terminal(parent)) {
      await tx.task.update({ where: { id }, data: { version: { increment: 1 } } });
      continue;
    }
    const children = await tx.task.findMany({ where: { parentId: id } });
    await tx.task.update({
      where: { id },
      data: {
        status: groupStatus(children.map((c) => ({ ...c, dependencies: [] }))),
        version: { increment: 1 },
      },
    });
  }
}
async function checkParents(
  tx: Tx,
  ids: Array<string | null>,
  versions: Record<string, number>,
  oldParent: string | null = null,
) {
  for (const id of new Set(ids.filter((v): v is string => v !== null))) {
    const p = await tx.task.findUnique({ where: { id } });
    if (!p || p.version !== versions[id]) throw conflict();
    if ((terminal(p) || p.archived) && !(id === oldParent && p.status === 'Cancelled'))
      throw new ForgeError('INVALID_RELATION', '已结束的任务组不能改变成员');
  }
}
export function taskStore(db: PrismaClient, mutate: Mutate, read: <T>(fn: () => Promise<T>) => Promise<T>) {
  return {
    board(projectId: string): Promise<Board> {
      return read(() =>
        db.$transaction(async (tx) => {
          if (!(await tx.project.findUnique({ where: { id: projectId } }))) throw missing();
          return {
            tasks: await tasks(tx, projectId),
            eventCursor: (await tx.activityEvent.aggregate({ _max: { seq: true } }))._max.seq ?? 0,
          };
        }),
      );
    },
    detail(taskId: string): Promise<TaskDetail> {
      return read(() =>
        db.$transaction(async (tx) => {
          const t = await tx.task.findUnique({ where: { id: taskId } });
          if (!t) throw missing();
          const all = await tasks(tx, t.projectId);
          const revisions = await tx.taskRevision.findMany({
            where: { taskId },
            orderBy: { createdAt: 'desc' },
          });
          const events = await tx.activityEvent.findMany({
            where: { entityId: taskId },
            orderBy: { seq: 'desc' },
          });
          return {
            task: all.find((x) => x.id === taskId)!,
            revisions: revisions.map((r) => ({
              ...r,
              dependencies: r.dependencies as string[],
              createdAt: r.createdAt.toISOString(),
            })),
            activities: events.map((e) => ({
              seq: e.seq,
              type: e.type,
              timestamp: e.timestamp.toISOString(),
              summary: JSON.stringify(e.payload),
            })),
          };
        }),
      );
    },
    mutateTask(command: TaskCommand): Promise<Task | { id: string; version: number }> {
      return mutate(command.requestId, command, async (tx) => {
        if (command.method === 'project.update') {
          const result = await tx.project.updateMany({
            where: { id: command.projectId, version: command.expectedVersion },
            data: { name: command.name, description: command.description, version: { increment: 1 } },
          });
          if (result.count !== 1) throw conflict();
          return {
            result: { id: command.projectId, version: command.expectedVersion + 1 },
            entityId: command.projectId,
            type: 'project.updated',
          };
        }
        const creating = command.method === 'task.create';
        const current = creating ? null : await tx.task.findUnique({ where: { id: command.taskId } });
        if (!creating && (!current || current.version !== command.expectedVersion)) throw conflict();
        const projectId = creating ? command.projectId : current!.projectId;
        if (!(await tx.project.findUnique({ where: { id: projectId } }))) throw missing();
        const all = await tasks(tx, projectId);
        const previous = all.find((t) => t.id === current?.id);
        const id = current?.id ?? randomUUID();
        let event = command.method;
        if (command.method === 'task.reparent') {
          if (!previous!.allowedActions.reparent.allowed)
            throw new ForgeError('ACTION_NOT_ALLOWED', previous!.allowedActions.reparent.reason);
          if (previous!.parentId === command.parentId)
            throw new ForgeError('INVALID_RELATION', '父任务组未改变');
          await checkParents(
            tx,
            [previous!.parentId, command.parentId],
            command.parentVersions,
            previous!.parentId,
          );
          validateLinks({ ...previous!, parentId: command.parentId }, all);
          await tx.task.update({
            where: { id },
            data: { parentId: command.parentId, version: { increment: 1 } },
          });
          await refreshParents(tx, [previous!.parentId, command.parentId]);
        } else if (command.method === 'task.create' || command.method === 'task.update') {
          if (previous && !previous.allowedActions.edit.allowed)
            throw new ForgeError('ACTION_NOT_ALLOWED', previous.allowedActions.edit.reason);
          const changedParent = creating || previous!.parentId !== command.parentId;
          if (changedParent)
            await checkParents(
              tx,
              [previous?.parentId ?? null, command.parentId],
              command.parentVersions,
              previous?.parentId ?? null,
            );
          const proposed = {
            id,
            projectId,
            kind: creating ? command.kind : current!.kind,
            status: creating ? command.status : current!.status,
            archived: false,
            parentId: command.parentId,
            dependencies: command.dependencies,
          };
          validateLinks(proposed, all);
          // Human MANUAL work has no Agent authorization; do not silently add unfinished prerequisites once started.
          if (
            previous?.status === 'In Progress' &&
            command.dependencies.some(
              (d) => !previous.dependencies.includes(d) && all.find((t) => t.id === d)?.status !== 'Done',
            )
          )
            throw new ForgeError(
              'DEPENDENCIES_INCOMPLETE',
              '已开始的人工任务不能新增未完成依赖，请先完成该依赖',
            );
          const requirementChanged =
            !previous ||
            ['title', 'description', 'acceptanceCriteria'].some(
              (k) => previous[k as 'title'] !== command[k as 'title'],
            ) ||
            JSON.stringify(previous.dependencies) !== JSON.stringify(command.dependencies);
          const revisionId = requirementChanged ? randomUUID() : previous!.requirementRevisionId;
          const fields = {
            title: command.title,
            description: command.description,
            acceptanceCriteria: command.acceptanceCriteria,
            priority: command.priority,
            labels: command.labels,
            parentId: command.parentId,
            requirementRevisionId: revisionId,
          };
          if (creating) {
            const max = await tx.task.aggregate({
              where: { projectId },
              _max: { number: true, position: true },
            });
            await tx.task.create({
              data: {
                id,
                projectId,
                number: (max._max.number ?? 0) + 1,
                kind: command.kind,
                status: command.kind === 'GROUP' ? 'Backlog' : command.status,
                position: (max._max.position ?? 0) + 1024,
                ...fields,
              },
            });
          } else await tx.task.update({ where: { id }, data: { ...fields, version: { increment: 1 } } });
          await tx.taskDependency.deleteMany({ where: { taskId: id } });
          for (const dependsOnId of command.dependencies)
            await tx.taskDependency.create({ data: { projectId, taskId: id, dependsOnId } });
          if (requirementChanged)
            await tx.taskRevision.create({
              data: {
                id: revisionId,
                taskId: id,
                title: command.title,
                description: command.description,
                acceptanceCriteria: command.acceptanceCriteria,
                dependencies: command.dependencies,
                author: 'owner',
              },
            });
          if (changedParent) await refreshParents(tx, [previous?.parentId ?? null, command.parentId]);
        } else if (command.method === 'task.action') {
          const permission = previous!.allowedActions[command.action];
          if (!permission.allowed) throw new ForgeError('ACTION_NOT_ALLOWED', permission.reason);
          const status = (
            {
              backlog: 'Backlog',
              todo: 'Todo',
              start: 'In Progress',
              accept: 'Done',
              cancel: 'Cancelled',
              archive: previous!.status,
            } as const
          )[command.action];
          await tx.task.update({
            where: { id },
            data: { status, archived: command.action === 'archive', version: { increment: 1 } },
          });
          await refreshParents(tx, [previous!.parentId]);
          event = `task.${command.action}` as typeof event;
        } else if (command.method === 'task.reorder') {
          const target = all.find((t) => t.id === command.targetId);
          if (!target || target.version !== command.targetVersion) throw conflict();
          if (
            id === target.id ||
            target.status !== previous!.status ||
            target.archived ||
            !previous!.allowedActions.reorder.allowed
          )
            throw new ForgeError('ACTION_NOT_ALLOWED', '只能对同列的未归档任务排序');
          await tx.task.update({
            where: { id },
            data: { position: target.position, version: { increment: 1 } },
          });
          await tx.task.update({
            where: { id: target.id },
            data: { position: previous!.position, version: { increment: 1 } },
          });
        }
        const result = (await tasks(tx, projectId)).find((t) => t.id === id)!;
        return { result, entityId: id, type: event };
      });
    },
  };
}

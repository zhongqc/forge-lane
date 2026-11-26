/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Optional drag/drop has native button equivalents for every operation. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '../../../../packages/contracts/src/index';
import { priorities, statuses, type Task } from '../../../../packages/contracts/src/tasks';
import { TaskEditor } from './TaskDetail';
import { ProjectSettings } from './ProjectSettings';
import { unwrap, useTaskMutation, actionNames } from './task-ui';
export function Board({
  project,
  onDirty,
  refreshProjects,
  settingsVersion,
}: {
  project: Project;
  settingsVersion: number;
  onDirty: (v: boolean) => void;
  refreshProjects: () => Promise<unknown>;
}) {
  const query = useQuery({
    queryKey: ['board', project.id],
    queryFn: async () => unwrap(await window.forge.taskBoard(project.id)),
    refetchInterval: 5000,
  });
  const [selection, setSelection] = useState<Task | 'new' | null>(null),
    [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(''),
    [priority, setPriority] = useState(''),
    [label, setLabel] = useState(''),
    [parent, setParent] = useState(''),
    [status, setStatus] = useState(''),
    [archived, setArchived] = useState(false);
  const mutation = useTaskMutation(() => query.refetch());
  const tasks = query.data?.tasks ?? [];
  const filtered = tasks.filter(
    (t) =>
      (archived || !t.archived) &&
      (!search || `${t.title} #${t.number}`.toLowerCase().includes(search.toLowerCase())) &&
      (!priority || t.priority === priority) &&
      (!label || t.labels.includes(label)) &&
      (!parent || t.parentId === parent) &&
      (!status || t.status === status),
  );
  const act = (t: Task, action: keyof typeof actionNames) => {
    if (action === 'start' && !window.confirm('开始这项人工任务？')) return;
    void mutation.run({ method: 'task.action', taskId: t.id, expectedVersion: t.version, action });
  };
  if (selection !== null)
    return (
      <TaskEditor
        key={selection === 'new' ? 'new' : selection.id}
        task={selection === 'new' ? undefined : selection}
        tasks={tasks}
        projectId={project.id}
        onClose={() => {
          setSelection(null);
          void query.refetch();
        }}
        onDirty={onDirty}
        refresh={() => query.refetch()}
      />
    );
  if (settings)
    return (
      <ProjectSettings
        project={project}
        settingsVersion={settingsVersion}
        onClose={() => {
          setSettings(false);
          void refreshProjects();
        }}
        onDirty={onDirty}
        refresh={refreshProjects}
      />
    );
  return (
    <section aria-label="任务看板">
      <div className="section-heading">
        <div>
          <h2>{project.name} · 任务看板</h2>
          <p className="muted">{tasks.filter((t) => !t.archived).length} 项任务 · 本地保存</p>
        </div>
        <div className="task-toolbar">
          <button onClick={() => setSettings(true)}>项目设置</button>
          <button onClick={() => void query.refetch()}>刷新看板</button>
          <button className="primary" onClick={() => setSelection('new')}>
            新建任务
          </button>
        </div>
      </div>
      {query.isPending && <p>加载任务中…</p>}
      {query.isError && <p role="alert">无法读取任务，已有内容保留：{query.error.message}</p>}
      {mutation.error && (
        <p role="alert" className="error">
          {mutation.error}
        </p>
      )}
      <div className="board-filters">
        <label>
          搜索任务
          <input placeholder="标题或编号" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          筛选优先级
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">全部</option>
            {priorities.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          筛选标签
          <select value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">全部</option>
            {[...new Set(tasks.flatMap((t) => t.labels))].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          筛选父组
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">全部</option>
            {tasks
              .filter((t) => t.kind === 'GROUP')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.number} {t.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          筛选状态
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          包含归档
        </label>
      </div>
      {!query.isPending && filtered.length === 0 && (
        <p className="empty">
          {tasks.length === 0 ? '还没有任务，创建第一项本地任务。' : '没有符合筛选条件的任务。'}
        </p>
      )}
      <div className="board-columns">
        {statuses
          .filter((s) => s !== 'Cancelled' || status === 'Cancelled' || archived)
          .map((column) => {
            const items = filtered.filter((t) => t.status === column);
            return (
              <section
                key={column}
                className="board-column"
                aria-label={`${column} 列`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/forge-task');
                  const t = tasks.find((t) => t.id === id);
                  if (!t) return;
                  const action =
                    column === 'Todo'
                      ? 'todo'
                      : column === 'Backlog'
                        ? 'backlog'
                        : column === 'In Progress'
                          ? 'start'
                          : null;
                  if (action && t.allowedActions[action].allowed) act(t, action);
                  else setSelection(t);
                }}
              >
                <h3>
                  {column} <span>{items.length}</span>
                </h3>
                {items.map((t, index) => (
                  <article
                    key={t.id}
                    className="task-card"
                    draggable={!mutation.busy && !t.archived}
                    onDragStart={(e) => e.dataTransfer.setData('text/forge-task', t.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const source = tasks.find((x) => x.id === e.dataTransfer.getData('text/forge-task'));
                      if (source && source.id !== t.id && source.status === t.status) {
                        e.stopPropagation();
                        void mutation.run({
                          method: 'task.reorder',
                          taskId: source.id,
                          expectedVersion: source.version,
                          targetId: t.id,
                          targetVersion: t.version,
                        });
                      }
                    }}
                  >
                    <div className="card-meta">
                      <span>
                        #{t.number} · {t.kind}
                      </span>
                      <span>{t.priority}</span>
                    </div>
                    <button className="card-title" onClick={() => setSelection(t)}>
                      {t.title}
                    </button>
                    {t.archived && <span className="badge">已归档</span>}
                    {t.kind === 'GROUP' && (
                      <p>
                        子任务 {t.progress.done}/{t.progress.total}
                      </p>
                    )}
                    {t.labels.length > 0 && <p className="card-labels">{t.labels.join(' · ')}</p>}
                    {t.blockedReasons.length > 0 && (
                      <p className="blocked">{t.blockedReasons.length} 项依赖未完成</p>
                    )}
                    {t.kind === 'CODE' && <small>执行未开放</small>}
                    <details>
                      <summary>卡片操作</summary>
                      <div className="card-actions">
                        {(['backlog', 'todo', 'start'] as const).map((action) => (
                          <button
                            key={action}
                            disabled={mutation.busy || !t.allowedActions[action].allowed}
                            title={t.allowedActions[action].reason}
                            onClick={() => act(t, action)}
                          >
                            {actionNames[action]}
                          </button>
                        ))}
                        <button
                          disabled={mutation.busy || index === 0 || !t.allowedActions.reorder.allowed}
                          onClick={() => {
                            const target = items[index - 1];
                            void mutation.run({
                              method: 'task.reorder',
                              taskId: t.id,
                              expectedVersion: t.version,
                              targetId: target.id,
                              targetVersion: target.version,
                            });
                          }}
                        >
                          向上排序
                        </button>
                      </div>
                    </details>
                  </article>
                ))}
              </section>
            );
          })}
      </div>
      <p className="muted">
        拖拽支持 Backlog / Todo、列内排序；拖入 In Progress
        需确认开始。其余状态通过详情中的验收与取消动作改变。
      </p>
    </section>
  );
}

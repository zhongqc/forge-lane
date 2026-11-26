import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import type { Task, TaskFields, TaskKind } from '../../../../packages/contracts/src/tasks';
import { kinds, priorities, taskFieldsSchema } from '../../../../packages/contracts/src/tasks';
import { useDirty, useTaskMutation, unwrap, actionNames } from './task-ui';
export function TaskEditor({
  task,
  tasks,
  projectId,
  onClose,
  onDirty,
  refresh,
}: {
  task?: Task;
  tasks: Task[];
  projectId: string;
  onClose: () => void;
  onDirty: (v: boolean) => void;
  refresh: () => Promise<unknown>;
}) {
  const [base, setBase] = useState(task);
  const [latest, setLatest] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [parents, setParents] = useState(() => Object.fromEntries(tasks.map((t) => [t.id, t.version])));
  const [fields, setFields] = useState<TaskFields>(() =>
    base
      ? {
          title: base.title,
          description: base.description,
          acceptanceCriteria: base.acceptanceCriteria,
          labels: base.labels,
          priority: base.priority,
          dependencies: base.dependencies,
          parentId: base.parentId,
        }
      : {
          title: '',
          description: '',
          acceptanceCriteria: '',
          labels: [],
          priority: 'MEDIUM',
          dependencies: [],
          parentId: null,
        },
  );
  const [labelText, setLabelText] = useState(base?.labels.join(', ') ?? '');
  const [kind, setKind] = useState<TaskKind>(base?.kind ?? 'CODE');
  const [status, setStatus] = useState<'Backlog' | 'Todo'>('Backlog');
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [validation, setValidation] = useState('');
  const mutation = useTaskMutation(refresh);
  useDirty(dirty || mutation.busy, onDirty);
  const update = <K extends keyof TaskFields>(key: K, value: TaskFields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const detail = useQuery({
    queryKey: ['detail', base?.id],
    enabled: !!base,
    queryFn: async () => unwrap(await window.forge.taskDetail(base!.id)),
    refetchInterval: 5000,
  });
  const close = () => {
    if (!mutation.busy && (!dirty || window.confirm('有未保存内容，是否放弃并离开？'))) onClose();
  };
  const editable = !base || base.allowedActions.edit.allowed;
  return (
    <section className="panel task-detail" aria-label="任务详情">
      <header className="section-heading">
        <h2>
          {base ? `#${base.number} · ${base.kind} · ${detail.data?.task.status ?? base.status}` : '新建任务'}
        </h2>
        <button onClick={close} disabled={mutation.busy}>
          关闭详情
        </button>
      </header>
      {mutation.error && (
        <p role="alert" className="error">
          {mutation.error}
        </p>
      )}
      {validation && (
        <p role="alert" className="error">
          {validation}
        </p>
      )}
      {detail.isError && (
        <p role="alert">
          详情加载失败，输入保留。<button onClick={() => void detail.refetch()}>重试详情</button>
        </p>
      )}
      {detail.data && base && detail.data.task.version !== base.version && (
        <div className="notice">
          <p>
            任务已变化：编辑基于版本 {base.version}，当前版本 {detail.data.task.version}
            。请比较后关闭并重新打开；不会覆盖当前输入。
          </p>
          <details>
            <summary>比较最新内容</summary>
            <pre>{JSON.stringify(detail.data.task, null, 2)}</pre>
          </details>
        </div>
      )}
      <section className="notice">
        <button
          type="button"
          disabled={mutation.busy}
          onClick={async () => {
            try {
              setLatest(unwrap(await window.forge.taskBoard(projectId)).tasks);
              setLoadError('');
            } catch (e) {
              setLoadError(String(e));
            }
          }}
        >
          读取最新版本
        </button>
        {loadError && <p role="alert">{loadError}</p>}
        {latest && (
          <>
            <details open>
              <summary>最新内容（草稿仍保留在下方）</summary>
              <pre>
                {JSON.stringify(
                  latest
                    .filter((t) => t.id === base?.id || t.id === fields.parentId || t.id === base?.parentId)
                    .map((t) => ({
                      number: t.number,
                      version: t.version,
                      title: t.title,
                      description: t.description,
                      acceptanceCriteria: t.acceptanceCriteria,
                      parentId: t.parentId,
                      dependencies: t.dependencies,
                    })),
                  null,
                  2,
                )}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => {
                if (base) setBase(latest.find((t) => t.id === base.id));
                setParents(Object.fromEntries(latest.map((t) => [t.id, t.version])));
                setLatest(null);
              }}
            >
              以最新版本继续编辑当前草稿
            </button>
          </>
        )}
      </section>
      {base && !base.allowedActions.edit.allowed && base.allowedActions.reparent.allowed && (
        <div className="notice">
          <p>调整成员关系不会重开任务或修改需求；取消的子任务可从组中移出。</p>
          <select
            aria-label="调整父任务组"
            value={fields.parentId ?? ''}
            onChange={(e) => update('parentId', e.target.value || null)}
          >
            <option value="">无父组</option>
            {tasks
              .filter((t) => t.kind === 'GROUP' && !t.archived && !['Done', 'Cancelled'].includes(t.status))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.number} {t.title}
                </option>
              ))}
          </select>
          <button
            disabled={mutation.busy || base.parentId === fields.parentId}
            onClick={() => {
              const versions: Record<string, number> = {};
              for (const id of [base.parentId, fields.parentId]) if (id) versions[id] = parents[id];
              void mutation.run(
                {
                  method: 'task.reparent',
                  taskId: base.id,
                  expectedVersion: base.version,
                  parentId: fields.parentId,
                  parentVersions: versions,
                },
                () => {
                  setDirty(false);
                  onClose();
                },
              );
            }}
          >
            保存成员关系
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!editable) return;
          const parsed = taskFieldsSchema.safeParse({
            ...fields,
            labels: labelText
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean),
          });
          if (!parsed.success) {
            setValidation(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；'));
            return;
          }
          setValidation('');
          const parentVersions: Record<string, number> = {};
          if (!base || base.parentId !== fields.parentId)
            for (const id of [base?.parentId, fields.parentId]) if (id) parentVersions[id] = parents[id];
          const command = base
            ? {
                method: 'task.update' as const,
                taskId: base.id,
                expectedVersion: base.version,
                ...parsed.data,
                parentVersions,
              }
            : { method: 'task.create' as const, projectId, kind, status, ...parsed.data, parentVersions };
          void mutation.run(command, () => {
            setDirty(false);
            onClose();
          });
        }}
      >
        <fieldset disabled={mutation.busy || !editable}>
          {!base && (
            <div className="form-grid">
              <label>
                任务类型
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as TaskKind);
                    setDirty(true);
                    if (e.target.value === 'GROUP')
                      setFields((f) => ({ ...f, parentId: null, dependencies: [] }));
                  }}
                >
                  {kinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                初始状态
                <select
                  value={status}
                  disabled={kind === 'GROUP'}
                  onChange={(e) => {
                    setStatus(e.target.value as typeof status);
                    setDirty(true);
                  }}
                >
                  <option>Backlog</option>
                  <option>Todo</option>
                </select>
              </label>
            </div>
          )}
          <label>
            任务标题
            <input
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
              }}
              autoFocus
              required
              maxLength={200}
              value={fields.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              优先级
              <select
                value={fields.priority}
                onChange={(e) => update('priority', e.target.value as TaskFields['priority'])}
              >
                {priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              标签（逗号分隔）
              <input
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229))
                    e.preventDefault();
                }}
                value={labelText}
                onChange={(e) => {
                  setLabelText(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>
          <label>
            描述（Markdown）
            <textarea
              rows={7}
              maxLength={200000}
              value={fields.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </label>
          <label>
            验收标准（Markdown）
            <textarea
              rows={4}
              maxLength={20000}
              value={fields.acceptanceCriteria}
              onChange={(e) => update('acceptanceCriteria', e.target.value)}
            />
          </label>
          {kind !== 'GROUP' && (
            <>
              <label>
                父任务组
                <select
                  value={fields.parentId ?? ''}
                  onChange={(e) => update('parentId', e.target.value || null)}
                >
                  <option value="">无父组</option>
                  {tasks
                    .filter((t) => t.kind === 'GROUP' && (!t.archived || t.id === fields.parentId))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        #{t.number} {t.title} · {t.status}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset className="dependency-list">
                <legend>依赖任务（仅同项目叶子任务）</legend>
                {tasks
                  .filter(
                    (t) =>
                      t.kind !== 'GROUP' &&
                      t.id !== base?.id &&
                      (!t.archived || fields.dependencies.includes(t.id)),
                  )
                  .map((t) => (
                    <label key={t.id}>
                      <input
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229))
                            e.preventDefault();
                        }}
                        type="checkbox"
                        checked={fields.dependencies.includes(t.id)}
                        onChange={(e) =>
                          update(
                            'dependencies',
                            e.target.checked
                              ? [...fields.dependencies, t.id]
                              : fields.dependencies.filter((id) => id !== t.id),
                          )
                        }
                      />
                      #{t.number} {t.title} · {t.status}
                    </label>
                  ))}
                {!tasks.some((t) => t.kind !== 'GROUP' && t.id !== base?.id) && <p>暂无可选依赖</p>}
              </fieldset>
            </>
          )}
        </fieldset>
        <div className="task-toolbar">
          <button type="button" onClick={() => setPreview(!preview)}>
            {preview ? '收起预览' : '预览 Markdown'}
          </button>
          {editable && (
            <button className="primary" disabled={mutation.busy || !fields.title.trim()}>
              {mutation.busy ? '保存中…' : '保存任务'}
            </button>
          )}
          <button type="button" onClick={close} disabled={mutation.busy}>
            取消编辑
          </button>
        </div>
      </form>
      {preview && (
        <div className="markdown">
          <h3>描述预览</h3>
          <Markdown
            skipHtml
            components={{
              img: ({ alt }) => <span>[图片：{alt}]</span>,
              a: ({ children }) => <span>{children}</span>,
            }}
          >
            {fields.description}
          </Markdown>
          <h3>验收标准预览</h3>
          <Markdown
            skipHtml
            components={{
              img: ({ alt }) => <span>[图片：{alt}]</span>,
              a: ({ children }) => <span>{children}</span>,
            }}
          >
            {fields.acceptanceCriteria}
          </Markdown>
        </div>
      )}
      {base && (
        <>
          <h3>任务动作</h3>
          <div className="task-toolbar">
            {Object.entries(actionNames).map(([action, label]) => {
              const permission = base.allowedActions[action as keyof typeof actionNames];
              return (
                <span key={action}>
                  <button
                    disabled={dirty || mutation.busy || !permission.allowed}
                    title={permission.reason}
                    onClick={() => {
                      if (
                        ['cancel', 'accept'].includes(action) &&
                        !window.confirm(`确认${label}？此操作不可撤销。`)
                      )
                        return;
                      void mutation.run(
                        {
                          method: 'task.action',
                          taskId: base.id,
                          expectedVersion: base.version,
                          action: action as keyof typeof actionNames,
                        },
                        onClose,
                      );
                    }}
                  >
                    {label}
                  </button>
                  {!permission.allowed && action === 'start' && <small>{permission.reason}</small>}
                </span>
              );
            })}
          </div>
          {base.blockedReasons.length > 0 && (
            <p className="notice">
              {base.blockedReasons
                .map((id) => {
                  const t = tasks.find((t) => id.includes(t.id));
                  return t ? `依赖 #${t.number} ${t.title} 尚未完成` : id;
                })
                .join('；')}
            </p>
          )}
          {base.kind === 'GROUP' && (
            <>
              <h3>
                子任务 · {base.progress.done}/{base.progress.total}
              </h3>
              <ul>
                {tasks
                  .filter((t) => t.parentId === base.id)
                  .map((t) => (
                    <li key={t.id}>
                      #{t.number} {t.title} · {t.status}
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="muted">
            本阶段提供本地任务管理。Agent Runs、PR、CI、Review 与原始对话将在执行能力接入后提供。
          </p>
          <details>
            <summary>需求修订（{detail.data?.revisions.length ?? 0}）</summary>
            {detail.data?.revisions.map((r) => (
              <article key={r.id}>
                <h4>
                  {r.title} · {new Date(r.createdAt).toLocaleString()}
                </h4>
                <p>
                  作者：{r.author} · {r.id}
                </p>
                <pre>{r.description}</pre>
                <pre>{r.acceptanceCriteria}</pre>
                <p>
                  依赖：
                  {r.dependencies.map((id) => tasks.find((t) => t.id === id)?.number ?? id).join(', ') ||
                    '无'}
                </p>
              </article>
            ))}
          </details>
          <details>
            <summary>活动记录（{detail.data?.activities.length ?? 0}）</summary>
            <ol>
              {detail.data?.activities.map((a) => (
                <li key={a.seq}>
                  {a.type} · {new Date(a.timestamp).toLocaleString()}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}

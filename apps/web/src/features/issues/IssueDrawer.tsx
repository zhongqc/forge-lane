import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useState, useRef, useEffect, Suspense, lazy } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Link2,
  Plus,
  ArrowUpRight,
  MessageSquare,
  History,
  Check,
  Send,
  PenLine,
  Trash2,
} from 'lucide-react';
import { IssueDevelopment, GitHubActivity, githubUrl } from '../github/IssueDevelopment';
import { api } from '../../lib/api';
import { useIssueMutation } from '../../lib/issue-mutations';
import {
  Avatar,
  SelectField,
  TypeIcon,
  PriorityIcon,
  ErrorNotice,
  Modal,
  Loading,
  priorityLabels,
  typeLabels,
} from '../../components/ui';
import { CreateIssueDialog } from './CreateIssueDialog';
import type {
  Issue,
  BoardData,
  Activity,
  Comment,
  Priority,
  IssueType,
} from '../../../../../packages/shared/src/contracts';
const DescriptionEditor = lazy(() =>
  import('../editor/DescriptionEditor').then((m) => ({ default: m.DescriptionEditor })),
);
export function IssueDrawer({
  issueKey,
  data,
  onClose,
  onOpen,
}: {
  issueKey: string;
  data?: BoardData;
  onClose: () => void;
  onOpen: (i: Issue) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: issue, error } = useQuery({
    queryKey: ['issue', issueKey],
    queryFn: () => api<Issue>(`/issues/by-key/${issueKey}`),
  });
  const { data: ownBoard } = useQuery({
    queryKey: ['board', issue?.projectId],
    queryFn: () => api<BoardData>(`/projects/${issue!.projectId}/board`),
    enabled: !!issue && data?.project.id !== issue.projectId,
  });
  const board = data?.project.id === issue?.projectId ? data : ownBoard;
  const canWrite = board?.permissions.canWrite ?? false;
  const [titleEditing, setTitleEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [estimateEditing, setEstimateEditing] = useState(false);
  const [estimate, setEstimate] = useState('');
  const [busy, setBusy] = useState('');
  const [saveError, setSaveError] = useState<unknown>();
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [subtask, setSubtask] = useState(false);
  const [tab, setTab] = useState('comments');
  const [copied, setCopied] = useState(false);
  const pendingNavigation = useRef<() => void>(() => onClose());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisionId, setRevisionId] = useState('');
  const [moreActivities, setMoreActivities] = useState<Activity[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null | undefined>();
  const mutate = useIssueMutation();
  const { data: activities } = useQuery({
    queryKey: ['activity', issue?.id],
    queryFn: () => api<{ items: Activity[]; nextCursor: string | null }>(`/issues/${issue!.id}/activities`),
    enabled: !!issue,
  });
  const { data: comments } = useQuery({
    queryKey: ['comments', issue?.id],
    queryFn: () => api<Comment[]>(`/issues/${issue!.id}/comments`),
    enabled: !!issue,
  });
  const onDirty = useCallback((v: boolean) => setDirty(v), []);
  function saved(i: Issue) {
    qc.setQueryData(['issue', issueKey], i);
    void qc.invalidateQueries({ queryKey: ['board', i.projectId] });
    void qc.invalidateQueries({ queryKey: ['activity', i.id] });
  }
  async function update(field: string, value: unknown) {
    if (!issue || !canWrite) return;
    setBusy(field);
    setSaveError(null);
    try {
      await mutate(issue, { [field]: value });
      if (field === 'title') setTitleEditing(false);
      if (field === 'estimate') setEstimateEditing(false);
    } catch (e) {
      setSaveError(e);
    } finally {
      setBusy('');
    }
  }
  function close(action = onClose) {
    if (dirty) {
      pendingNavigation.current = action;
      setConfirmClose(true);
    } else action();
  }
  useEffect(() => {
    if (!dirty) return;
    const path = window.location.pathname;
    const back = () => {
      const destination = window.location.pathname;
      void navigate(path, { replace: true });
      pendingNavigation.current = () => {
        void navigate(destination);
      };
      setConfirmClose(true);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [dirty, navigate]);
  const { data: revisions } = useQuery({
    queryKey: ['revisions', issue?.id],
    queryFn: () =>
      api<{ id: string; version: number; createdAt: string; actor: { name: string } }[]>(
        `/issues/${issue!.id}/revisions`,
      ),
    enabled: !!issue && historyOpen,
  });
  const { data: revision } = useQuery({
    queryKey: ['revision', revisionId],
    queryFn: () => api<{ markdown: string }>(`/issues/${issue!.id}/revisions/${revisionId}`),
    enabled: !!issue && !!revisionId && historyOpen,
  });

  const date = (v: string) =>
    new Intl.DateTimeFormat('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(v));
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="issue-drawer"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (dirty) {
              e.preventDefault();
              close();
            }
          }}
        >
          <Dialog.Title className="sr-only">事项详情</Dialog.Title>
          <header className="drawer-top">
            <span>
              {issue && <TypeIcon type={issue.type} />}
              <span className="issue-key">{issueKey}</span>
              <span className="muted">/</span>
              <span className="muted">{issue ? typeLabels[issue.type] : '事项'}</span>
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="复制事项链接"
                onClick={() => {
                  void navigator.clipboard.writeText(`${location.origin}/issues/${issueKey}`).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? <Check size={17} /> : <Link2 size={17} />}
              </button>
              <button className="icon-button" aria-label="关闭详情" onClick={() => close()}>
                <X size={20} />
              </button>
            </div>
          </header>
          {error ? (
            <ErrorNotice error={error} />
          ) : !issue || !board ? (
            <Loading />
          ) : (
            <div className="drawer-scroll">
              <div className="issue-detail-heading">
                {titleEditing ? (
                  <input
                    className="title-edit"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') void update('title', title);
                      if (e.key === 'Escape') setTitleEditing(false);
                    }}
                    onBlur={() => {
                      if (title.trim() && title !== issue.title) void update('title', title);
                      else setTitleEditing(false);
                    }}
                    maxLength={240}
                  />
                ) : (
                  <button
                    className="issue-title"
                    disabled={!canWrite}
                    onClick={() => {
                      setTitle(issue.title);
                      setTitleEditing(true);
                    }}
                  >
                    {issue.title}
                    <PenLine size={17} />
                  </button>
                )}
                <div className="detail-status-row">
                  <SelectField
                    label="状态"
                    value={issue.statusId}
                    options={board.statuses.map((s) => ({
                      value: s.id,
                      label: s.name,
                      icon: <span className={`status-dot category-${s.category}`} />,
                    }))}
                    onChange={(v) => void update('statusId', v)}
                    disabled={!canWrite || !!busy}
                  />
                  <span className="save-indicator">{busy ? '保存中…' : '已同步'}</span>
                </div>
              </div>
              <ErrorNotice error={saveError} />
              <div className="issue-properties">
                <div>
                  <span className="property-label">负责人</span>
                  <SelectField
                    label="负责人"
                    value={issue.assigneeId ?? ''}
                    options={[
                      { value: '', label: '未分配', icon: <Avatar small /> },
                      ...board.members.map((m) => ({
                        value: m.id,
                        label: m.name,
                        icon: <Avatar actor={m} small />,
                      })),
                    ]}
                    onChange={(v) => void update('assigneeId', v || null)}
                    disabled={!canWrite || !!busy}
                  />
                </div>
                <div>
                  <span className="property-label">优先级</span>
                  <SelectField
                    label="优先级"
                    value={issue.priority}
                    options={Object.entries(priorityLabels).map(([value, label]) => ({
                      value,
                      label,
                      icon: <PriorityIcon priority={value as Priority} />,
                    }))}
                    onChange={(v) => void update('priority', v)}
                    disabled={!canWrite || !!busy}
                  />
                </div>
                <div>
                  <span className="property-label">类型</span>
                  <SelectField
                    label="事项类型"
                    value={issue.type}
                    options={Object.entries(typeLabels)
                      .filter(([t]) => (issue.type === 'SUBTASK' ? t === 'SUBTASK' : t !== 'SUBTASK'))
                      .map(([value, label]) => ({
                        value,
                        label,
                        icon: <TypeIcon type={value as IssueType} />,
                      }))}
                    onChange={(v) => void update('type', v)}
                    disabled={!canWrite || !!busy}
                  />
                </div>
                {issue.type !== 'EPIC' && (
                  <div>
                    <span className="property-label">Sprint</span>
                    {issue.type === 'SUBTASK' ? (
                      <span className="inherited">
                        {board.sprints.find((s) => s.id === issue.effectiveSprintId)?.name ?? 'Backlog'} ·
                        继承
                      </span>
                    ) : (
                      <SelectField
                        label="Sprint"
                        value={issue.sprintId ?? ''}
                        options={[
                          { value: '', label: 'Backlog' },
                          ...board.sprints
                            .filter((s) => s.status !== 'COMPLETED' || s.id === issue.sprintId)
                            .map((s) => ({ value: s.id, label: s.name })),
                        ]}
                        onChange={(v) => void update('sprintId', v || null)}
                        disabled={!canWrite || !!busy}
                      />
                    )}
                  </div>
                )}
                {!['EPIC', 'SUBTASK'].includes(issue.type) && (
                  <>
                    <div>
                      <span className="property-label">Epic</span>
                      <SelectField
                        label="Epic"
                        value={issue.epicId ?? ''}
                        options={[
                          { value: '', label: '无 Epic' },
                          ...board.issues
                            .filter((i) => i.type === 'EPIC')
                            .map((i) => ({ value: i.id, label: i.title, icon: <TypeIcon type="EPIC" /> })),
                        ]}
                        onChange={(v) => void update('epicId', v || null)}
                        disabled={!canWrite || !!busy}
                      />
                    </div>
                    <div>
                      <span className="property-label">估点</span>
                      {estimateEditing ? (
                        <input
                          className="estimate-input"
                          autoFocus
                          type="number"
                          min="0"
                          max="100000"
                          step="any"
                          value={estimate}
                          onChange={(e) => setEstimate(e.target.value)}
                          onBlur={() => void update('estimate', estimate === '' ? null : Number(estimate))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEstimateEditing(false);
                          }}
                        />
                      ) : (
                        <button
                          className="property-value"
                          disabled={!canWrite}
                          onClick={() => {
                            setEstimate(issue.estimate?.toString() ?? '');
                            setEstimateEditing(true);
                          }}
                        >
                          {issue.estimate !== null ? (
                            `${issue.estimate} SP`
                          ) : (
                            <span className="muted">未估点</span>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {issue.parent && (
                  <div>
                    <span className="property-label">父事项</span>
                    <button
                      className="text-button"
                      onClick={() => close(() => onOpen({ ...issue, ...issue.parent } as Issue))}
                    >
                      {issue.parent.key}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                )}
                <div className="label-property">
                  <span className="property-label">标签</span>
                  <div>
                    {issue.labels.map(({ label }) => (
                      <button
                        className="label-tag"
                        disabled={!canWrite}
                        key={label.id}
                        onClick={() =>
                          void update(
                            'labelIds',
                            issue.labels.filter((l) => l.label.id !== label.id).map((l) => l.label.id),
                          )
                        }
                      >
                        {label.name}
                        <X size={10} />
                      </button>
                    ))}
                    <SelectField
                      disabled={!canWrite || !!busy}
                      label="添加标签"
                      value=""
                      options={board.labels
                        .filter((l) => !issue.labels.some((i) => i.label.id === l.id))
                        .map((l) => ({ value: l.id, label: l.name }))}
                      onChange={(v) => void update('labelIds', [...issue.labels.map((l) => l.label.id), v])}
                      placeholder="添加标签"
                    />
                  </div>
                </div>
              </div>
              <section className="detail-section">
                <div className="section-title">
                  <h3>描述</h3>
                  <button
                    className="text-button"
                    onClick={() => {
                      setHistoryOpen(true);
                      setRevisionId('');
                    }}
                  >
                    版本记录
                  </button>
                </div>
                <Suspense fallback={<Loading />}>
                  <DescriptionEditor
                    readOnly={!canWrite}
                    key={issue.id}
                    issue={issue}
                    onSaved={saved}
                    onDirty={onDirty}
                  />
                </Suspense>
              </section>
              {issue.type !== 'SUBTASK' && (
                <section className="detail-section">
                  <div className="section-title">
                    <h3>
                      {issue.type === 'EPIC' ? '关联事项' : '子任务'}{' '}
                      <span>
                        {issue.type === 'EPIC'
                          ? board.issues.filter((i) => i.epicId === issue.id).length
                          : (issue.children?.length ?? 0)}
                      </span>
                    </h3>
                    {issue.type !== 'EPIC' && (
                      <button className="text-button" disabled={!canWrite} onClick={() => setSubtask(true)}>
                        <Plus size={14} />
                        添加子任务
                      </button>
                    )}
                  </div>
                  {(issue.type === 'EPIC'
                    ? board.issues.filter((i) => i.epicId === issue.id)
                    : (issue.children ?? [])
                  ).map((child) => (
                    <button className="child-row" key={child.id} onClick={() => close(() => onOpen(child))}>
                      <TypeIcon type={child.type} />
                      <span className="issue-key">{child.key}</span>
                      <span>{child.title}</span>
                      <span className="muted">{child.status.name}</span>
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </section>
              )}
              {issue.type !== 'EPIC' && <IssueDevelopment issueId={issue.id} issueKey={issue.key} />}
              <section className="detail-section activity-section">
                <div className="detail-tabs">
                  <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
                    <MessageSquare size={14} />
                    评论 <span>{comments?.filter((c) => !c.deletedAt).length ?? 0}</span>
                  </button>
                  <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                    <History size={14} />
                    活动记录
                  </button>
                </div>
                {tab === 'comments' ? (
                  <Comments readOnly={!canWrite} issue={issue} comments={comments ?? []} />
                ) : (
                  <div className="activity-list">
                    {[...(activities?.items ?? []), ...moreActivities].map((a) => (
                      <div key={a.id} className="activity-item">
                        <span className="activity-dot" />
                        <div>
                          {a.type.startsWith('GITHUB_') ? (
                            <GitHubActivity activity={a} />
                          ) : a.type.startsWith('EXECUTION_') ? (
                            <ExecutionActivity activity={a} />
                          ) : (
                            <>
                              <strong>{a.actorNameSnapshot}</strong>{' '}
                              {a.type === 'CREATED'
                                ? '创建了事项'
                                : a.type === 'MOVED'
                                  ? a.payload.intent === 'rank'
                                    ? '调整了排序'
                                    : '移动了事项'
                                  : a.type.startsWith('COMMENT')
                                    ? '更新了评论'
                                    : a.type === 'SPRINT_INHERITED'
                                      ? '同步了父事项的 Sprint'
                                      : '更新了事项'}
                            </>
                          )}
                          <ActivityChanges activity={a} board={board} />
                          <time>{date(a.occurredAt)}</time>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              {tab === 'history' &&
                (historyCursor === undefined ? activities?.nextCursor : historyCursor) && (
                  <button
                    className="secondary small"
                    onClick={() =>
                      void api<{ items: Activity[]; nextCursor: string | null }>(
                        `/issues/${issue.id}/activities?cursor=${historyCursor ?? activities?.nextCursor}`,
                      )
                        .then((result) => {
                          setMoreActivities((items) => [...items, ...result.items]);
                          setHistoryCursor(result.nextCursor);
                        })
                        .catch(setSaveError)
                    }
                  >
                    加载更早记录
                  </button>
                )}
              <div className="issue-meta">
                <span>
                  由 {issue.reporter.name} 创建于 {date(issue.createdAt)}
                </span>
                <span>更新于 {date(issue.updatedAt)}</span>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
      <Modal open={confirmClose} onOpenChange={setConfirmClose} title="描述尚未保存">
        <p>可以保留草稿并关闭，下次打开此事项时继续编辑。</p>
        <footer className="modal-footer">
          <button className="secondary" onClick={() => setConfirmClose(false)}>
            继续编辑
          </button>
          <button
            className="secondary"
            onClick={async () => {
              if (issue) {
                const { discardDraft } = await import('../editor/DescriptionEditor');
                discardDraft(issue.id);
              }
              setConfirmClose(false);
              pendingNavigation.current();
            }}
          >
            放弃草稿并关闭
          </button>
          <button
            className="primary"
            onClick={() => {
              setConfirmClose(false);
              pendingNavigation.current();
            }}
          >
            保留草稿并关闭
          </button>
        </footer>
      </Modal>
      <Modal open={historyOpen} onOpenChange={setHistoryOpen} title="描述版本记录" wide>
        <div className="revision-layout">
          <div>
            {revisions?.map((r) => (
              <button
                className={`revision-entry ${revisionId === r.id ? 'selected' : ''}`}
                key={r.id}
                onClick={() => setRevisionId(r.id)}
              >
                <strong>版本 {r.version}</strong>
                <span>
                  {r.actor.name} · {new Date(r.createdAt).toLocaleString('zh-CN')}
                </span>
              </button>
            ))}
          </div>
          <div className="markdown">
            {revision ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {revision.markdown || '此版本没有描述。'}
              </ReactMarkdown>
            ) : (
              <p className="muted">选择一个版本查看内容。</p>
            )}
          </div>
        </div>
      </Modal>
      {subtask && issue && board && (
        <CreateIssueDialog
          data={board}
          open
          parentId={issue.id}
          onClose={() => {
            setSubtask(false);
            void qc.invalidateQueries({ queryKey: ['issue', issueKey] });
          }}
        />
      )}
    </Dialog.Root>
  );
}
function ActivityChanges({ activity, board }: { activity: Activity; board: BoardData }) {
  const names: Record<string, string> = {
    title: '标题',
    description: '描述',
    priority: '优先级',
    statusId: '状态',
    assigneeId: '负责人',
    sprintId: 'Sprint',
    epicId: 'Epic',
    estimate: '估点',
    type: '类型',
    labels: '标签',
    boardOrder: '排序',
  };
  const resolve = (key: string, value: unknown) => {
    if (value === null) return '无';
    if (key === 'statusId') return board.statuses.find((s) => s.id === value)?.name ?? '历史状态';
    if (key === 'assigneeId') return board.members.find((s) => s.id === value)?.name ?? '历史成员';
    if (key === 'sprintId') return board.sprints.find((s) => s.id === value)?.name ?? '历史 Sprint';
    if (key === 'epicId') return board.issues.find((s) => s.id === value)?.title ?? '历史 Epic';
    if (key === 'priority') return priorityLabels[value as Priority];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
  };
  return (
    <div className="activity-changes">
      {Object.entries(activity.payload)
        .filter(([k, v]) => k !== 'boardOrder' && v && typeof v === 'object' && 'before' in v)
        .map(([k, v]) => {
          const change = v as { before: unknown; after: unknown; beforeLabel?: string; afterLabel?: string };
          return (
            <div key={k}>
              {names[k] ?? k}
              {k === 'description' ? (
                '已保存新版本'
              ) : (
                <>
                  ：<span>{change.beforeLabel ?? resolve(k, change.before)}</span> →{' '}
                  {change.afterLabel ?? resolve(k, change.after)}
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
function Comments({ issue, comments, readOnly }: { issue: Issue; comments: Comment[]; readOnly: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [edit, setEdit] = useState<Comment | null>(null);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/issues/${issue.id}/comments${edit ? `/${edit.id}` : ''}`, edit ? 'PATCH' : 'POST', {
        content: text,
        ...(edit ? { version: edit.version } : {}),
      });
      setText('');
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['comments', issue.id] });
      void qc.invalidateQueries({ queryKey: ['activity', issue.id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const me = qc.getQueryData<{ actor: { id: string } }>(['me']);
  return (
    <>
      <div className="comments">
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <Avatar actor={c.actor} small />
            <div>
              <strong>{c.actor.name}</strong>
              <time>
                {new Date(c.createdAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <div className="markdown">
                {c.deletedAt ? (
                  '评论已删除'
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {c.content}
                  </ReactMarkdown>
                )}
              </div>
              {!c.deletedAt && c.actorId === me?.actor.id && (
                <div className="comment-actions">
                  <button
                    onClick={() => {
                      setEdit(c);
                      setText(c.content);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    aria-label="删除评论"
                    onClick={() =>
                      void api(`/issues/${issue.id}/comments/${c.id}`, 'DELETE', {
                        content: '删除',
                        version: c.version,
                      })
                        .then(() => qc.invalidateQueries({ queryKey: ['comments', issue.id] }))
                        .catch(setError)
                    }
                  >
                    <Trash2 size={11} />
                    删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <fieldset disabled={readOnly || busy} className="comment-composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={edit ? '编辑评论…' : '分享进展、提出问题，或留下你的想法…'}
          aria-label="评论内容"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) void send();
          }}
        />
        <div>
          <span>支持 Markdown · ⌘ Enter 发送</span>
          {edit && (
            <button
              className="text-button"
              onClick={() => {
                setEdit(null);
                setText('');
              }}
            >
              取消编辑
            </button>
          )}
          <button className="primary small" disabled={busy || !text.trim()} onClick={() => void send()}>
            <Send size={12} />
            {edit ? '保存评论' : '发送评论'}
          </button>
        </div>
      </fieldset>
      <ErrorNotice error={error} />
    </>
  );
}

function ExecutionActivity({ activity }: { activity: Activity }) {
  const executor = typeof activity.payload.executor === 'string' ? activity.payload.executor : 'CLI';
  const status = typeof activity.payload.status === 'string' ? activity.payload.status : '';
  const outcomes: Record<string, string> = {
    SUCCEEDED: '完成了开发执行',
    FAILED: '报告执行失败',
    CANCELLED: '释放了任务',
  };
  const summary = typeof activity.payload.summary === 'string' ? activity.payload.summary : '';
  const pr = githubUrl(activity.payload.prUrl);
  return (
    <>
      <strong>{activity.actorNameSnapshot}</strong> · {executor}{' '}
      {activity.type === 'EXECUTION_CLAIMED'
        ? '领取了任务'
        : activity.type === 'EXECUTION_RENEWED'
          ? '续期了任务租约'
          : (outcomes[status] ?? '结束了执行')}
      {summary && (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {summary}
          </ReactMarkdown>
        </div>
      )}
      {pr && (
        <a href={pr} target="_blank" rel="noreferrer">
          查看 Pull Request
        </a>
      )}
    </>
  );
}

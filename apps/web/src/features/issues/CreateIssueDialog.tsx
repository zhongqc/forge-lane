import { useState, useRef, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, SelectField, TypeIcon, ErrorNotice, typeLabels, priorityLabels } from '../../components/ui';
import { api } from '../../lib/api';
import type { BoardData, Issue, IssueType, Priority } from '../../../../../packages/shared/src/contracts';
const MarkdownComposer = lazy(() => import('../editor/MarkdownComposer'));
export function CreateIssueDialog({
  data,
  open,
  onClose,
  statusId,
  parentId,
  initialType = 'TASK',
  initialSprintId,
}: {
  data: BoardData;
  open: boolean;
  onClose: () => void;
  statusId?: string;
  parentId?: string;
  initialType?: IssueType;
  initialSprintId?: string;
}) {
  const qc = useQueryClient();
  const titleInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<IssueType>(parentId ? 'SUBTASK' : initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  function requestClose() {
    if (busy) return;
    if (title.trim() || description.trim()) setConfirmClose(true);
    else onClose();
  }
  const [status, setStatus] = useState(statusId ?? data.statuses[0]?.id);
  const [assignee, setAssignee] = useState('');
  const [epic, setEpic] = useState('');
  const [sprint, setSprint] = useState(initialSprintId ?? '');
  const [priority, setPriority] = useState<Priority>('NONE');
  const [estimate, setEstimate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [again, setAgain] = useState(false);
  async function submit() {
    if (busy || !title.trim()) return;
    const points = estimate === '' ? null : Number(estimate);
    if (
      type !== 'EPIC' &&
      type !== 'SUBTASK' &&
      points !== null &&
      (!Number.isFinite(points) || points < 0 || points > 100000)
    ) {
      setError(new Error('Story Points 需为 0 到 100000 之间的数字'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<Issue>(`/projects/${data.project.id}/issues`, 'POST', {
        title: title.trim(),
        description,
        type,
        priority,
        statusId: status,
        assigneeId: assignee || null,
        ...(type !== 'EPIC' && type !== 'SUBTASK' ? { estimate: points } : {}),
        ...(parentId
          ? { parentId }
          : type !== 'EPIC'
            ? { epicId: epic || null, sprintId: sprint || null }
            : {}),
      });
      await qc.invalidateQueries({ queryKey: ['board', data.project.id] });
      if (again) {
        setTitle('');
        setDescription('');
        setEditorKey((key) => key + 1);
        requestAnimationFrame(() => titleInput.current?.focus());
      } else onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!v) requestClose();
        }}
        title={parentId ? '添加子任务' : '新建事项'}
        wide
      >
        <div className="create-issue-form">
          <div className="create-context">
            <span>{data.project.key}</span>
            <span>/</span>
            <SelectField
              label="事项类型"
              value={type}
              options={(parentId ? ['SUBTASK'] : ['STORY', 'TASK', 'BUG', 'EPIC']).map((t) => ({
                value: t,
                label: typeLabels[t as IssueType],
                icon: <TypeIcon type={t as IssueType} />,
              }))}
              onChange={(v) => setType(v as IssueType)}
            />
          </div>
          <input
            ref={titleInput}
            className="create-title"
            autoFocus
            placeholder="需要完成什么？"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            maxLength={240}
            disabled={busy}
            required
          />
          <p className="muted create-help">
            {type === 'EPIC'
              ? 'Epic 汇集一个长期目标下的工作。'
              : type === 'STORY'
                ? '描述一项对用户有价值的需求。'
                : type === 'BUG'
                  ? '描述实际行为与预期的差异。'
                  : '用一个清晰的标题，开始推进工作。'}{' '}
            可在下方补充背景、方案和验收标准。
          </p>
          <section className="create-details" aria-label="基本信息">
            <div className="create-fields">
              <div className="create-field">
                <span className="create-field-label">状态</span>
                <SelectField
                  label="状态"
                  value={status}
                  options={data.statuses.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={setStatus}
                />
              </div>
              <div className="create-field">
                <span className="create-field-label">负责人</span>
                <SelectField
                  label="负责人"
                  value={assignee}
                  options={[
                    { value: '', label: '未分配' },
                    ...data.members.map((m) => ({ value: m.id, label: m.name })),
                  ]}
                  onChange={setAssignee}
                />
              </div>
              <div className="create-field">
                <span className="create-field-label">优先级</span>
                <SelectField
                  label="优先级"
                  value={priority}
                  options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))}
                  onChange={(value) => setPriority(value as Priority)}
                />
              </div>
              {type !== 'EPIC' && type !== 'SUBTASK' && (
                <label className="create-field create-estimate">
                  <span className="create-field-label">Story Points</span>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="any"
                    value={estimate}
                    onChange={(event) => setEstimate(event.target.value)}
                    placeholder="未估点"
                    aria-label="Story Points"
                  />
                </label>
              )}
              {!parentId && type !== 'EPIC' && (
                <>
                  <div className="create-field">
                    <span className="create-field-label">Epic</span>
                    <SelectField
                      label="Epic"
                      value={epic}
                      options={[
                        { value: '', label: '无 Epic' },
                        ...data.issues
                          .filter((i) => i.type === 'EPIC')
                          .map((i) => ({ value: i.id, label: i.title })),
                      ]}
                      onChange={setEpic}
                    />
                  </div>
                  <div className="create-field">
                    <span className="create-field-label">Sprint</span>
                    <SelectField
                      label="Sprint"
                      value={sprint}
                      options={[
                        { value: '', label: 'Backlog' },
                        ...data.sprints
                          .filter((s) => s.status !== 'COMPLETED')
                          .map((s) => ({ value: s.id, label: s.name })),
                      ]}
                      onChange={setSprint}
                    />
                  </div>
                </>
              )}
            </div>
          </section>
          <section className="create-description" aria-label="事项描述">
            <h3>
              描述 <span className="muted">选填</span>
            </h3>
            <Suspense fallback={<p className="muted">正在加载编辑器…</p>}>
              <MarkdownComposer
                projectId={data.project.id}
                key={editorKey}
                text={description}
                onChange={setDescription}
                busy={busy}
                onSubmit={() => void submit()}
              />
            </Suspense>
            <p className="muted">支持 Markdown 快捷输入 · 输入 / 插入内容 · ⌘ / Ctrl Enter 创建</p>
          </section>
          <ErrorNotice error={error} />
          <footer className="modal-footer">
            <label className="checkbox-label">
              <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
              继续创建下一个
            </label>
            <button type="button" className="secondary" disabled={busy} onClick={requestClose}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void submit()}
              disabled={busy || !title.trim()}
            >
              {busy ? '创建中…' : '创建事项'}
            </button>
          </footer>
        </div>
      </Modal>
      <Modal open={confirmClose} onOpenChange={setConfirmClose} title="放弃创建事项？">
        <p className="muted">标题和描述尚未保存。继续编辑可保留已填写的内容。</p>
        <footer className="modal-footer">
          <button className="secondary" onClick={() => setConfirmClose(false)}>
            继续编辑
          </button>
          <button className="primary" onClick={onClose}>
            放弃创建
          </button>
        </footer>
      </Modal>
    </>
  );
}

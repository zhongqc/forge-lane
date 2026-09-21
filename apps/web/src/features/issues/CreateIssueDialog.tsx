import { useState, useRef, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, SelectField, TypeIcon, ErrorNotice, typeLabels } from '../../components/ui';
import { api } from '../../lib/api';
import type { BoardData, Issue, IssueType } from '../../../../../packages/shared/src/contracts';
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
  const [status, setStatus] = useState(statusId ?? data.statuses[0]?.id);
  const [assignee, setAssignee] = useState('');
  const [epic, setEpic] = useState('');
  const [sprint, setSprint] = useState(initialSprintId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [again, setAgain] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api<Issue>(
        `/projects/${data.project.id}/issues`,
        'POST',
        {
          title: title.trim(),
          type,
          statusId: status,
          assigneeId: assignee || null,
          ...(parentId
            ? { parentId }
            : type !== 'EPIC'
              ? { epicId: epic || null, sprintId: sprint || null }
              : {}),
        },
        crypto.randomUUID(),
      );
      await qc.invalidateQueries({ queryKey: ['board', data.project.id] });
      if (again) {
        setTitle('');
        requestAnimationFrame(() => titleInput.current?.focus());
      } else onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={parentId ? '添加子任务' : '新建事项'}
    >
      <form onSubmit={submit}>
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
          maxLength={240}
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
          创建后可补充描述与执行细节。
        </p>
        <div className="create-fields">
          <SelectField
            label="状态"
            value={status}
            options={data.statuses.map((s) => ({ value: s.id, label: s.name }))}
            onChange={setStatus}
          />
          <SelectField
            label="负责人"
            value={assignee}
            options={[
              { value: '', label: '未分配' },
              ...data.members.map((m) => ({ value: m.id, label: m.name })),
            ]}
            onChange={setAssignee}
          />
          {!parentId && type !== 'EPIC' && (
            <>
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
            </>
          )}
        </div>
        <ErrorNotice error={error} />
        <footer className="modal-footer">
          <label className="checkbox-label">
            <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
            继续创建下一个
          </label>
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy || !title.trim()}>
            {busy ? '创建中…' : '创建事项'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

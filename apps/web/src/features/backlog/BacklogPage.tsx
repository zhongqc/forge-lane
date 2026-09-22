import Decimal from 'decimal.js';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { runIssueCommand } from '../../lib/issue-mutations';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarDays, Play, CheckCircle2, ChevronDown, ArrowUpRight, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useIssueMutation } from '../../lib/issue-mutations';
import { Modal, ErrorNotice, SelectField, TypeIcon, Avatar, PriorityIcon } from '../../components/ui';
import type { BoardData, Issue, Sprint } from '../../../../../packages/shared/src/contracts';
export function BacklogPage({
  data,
  onOpen,
  onCreate,
}: {
  data: BoardData;
  onOpen: (i: Issue) => void;
  onCreate: (sprintId?: string) => void;
}) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const [remove, setRemove] = useState<Sprint | null>(null);
  const [complete, setComplete] = useState<Sprint | null>(null);
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const mutate = useIssueMutation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  async function drop(e: DragEndEvent) {
    if (!data.permissions.canWrite) return;
    if (!e.over) return;
    const issue = data.issues.find((i) => i.id === e.active.id);
    if (!issue) return;
    const over = String(e.over.id);
    const target = over.startsWith('sprint:')
      ? over.slice(7) || null
      : (data.issues.find((i) => i.id === over)?.sprintId ?? null);
    const rows = data.issues
      .filter((i) => ['STORY', 'TASK', 'BUG'].includes(i.type) && i.sprintId === target && i.id !== issue.id)
      .sort((a, b) => Number(a.backlogOrder) - Number(b.backlogOrder));
    let index = rows.findIndex((i) => i.id === over);
    if (index < 0) index = rows.length;
    else if (
      e.active.rect.current.translated &&
      e.active.rect.current.translated.top > e.over.rect.top + e.over.rect.height / 2
    )
      index++;
    const previous = rows[index - 1];
    const next = rows[index];
    const rank =
      previous && next
        ? (Number(previous.backlogOrder) + Number(next.backlogOrder)) / 2
        : previous
          ? Number(previous.backlogOrder) + 1000
          : next
            ? Number(next.backlogOrder) - 1000
            : 1000;
    qc.setQueryData<BoardData>(['board', data.project.id], (b) =>
      b
        ? {
            ...b,
            issues: b.issues.map((i) =>
              i.id === issue.id ? { ...i, sprintId: target, backlogOrder: String(rank) } : i,
            ),
          }
        : b,
    );
    try {
      await runIssueCommand(qc, issue, (current) =>
        api<Issue>(
          `/projects/${data.project.id}/backlog/moves`,
          'POST',
          {
            issueId: issue.id,
            version: current.version,
            targetSprintId: target,
            previousIssueId: previous?.id ?? null,
            nextIssueId: next?.id ?? null,
          },
          crypto.randomUUID(),
        ),
      );
      setError(null);
    } catch (error) {
      setError(error);
      void qc.invalidateQueries({ queryKey: ['board', data.project.id] });
    }
  }
  async function command(s: Sprint, action: string) {
    setBusy(true);
    setError(null);
    try {
      await api(
        `/sprints/${s.id}${action === 'delete' ? '' : `/${action}`}`,
        action === 'delete' ? 'DELETE' : 'POST',
        {
          version: s.version,
          ...(action === 'complete' ? { destinationSprintId: destination || null } : {}),
        },
        crypto.randomUUID(),
      );
      setComplete(null);
      setRemove(null);
      await qc.invalidateQueries({ queryKey: ['board', data.project.id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function newSprint(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      await api('/sprints', 'POST', { projectId: data.project.id, ...values }, crypto.randomUUID());
      setCreate(false);
      await qc.invalidateQueries({ queryKey: ['board', data.project.id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const groups = [
    ...data.sprints
      .filter((s) => s.status !== 'COMPLETED')
      .sort((a, b) => (a.status === 'ACTIVE' ? -1 : b.status === 'ACTIVE' ? 1 : 0)),
    null,
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PLAN WITH INTENTION</div>
          <h1>Backlog</h1>
          <p>把下一步排清楚，让团队从容出发。</p>
        </div>
        <div className="heading-actions">
          <button className="secondary" disabled={!data.permissions.canWrite} onClick={() => setCreate(true)}>
            <CalendarDays size={15} />
            创建 Sprint
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
        <div className="backlog-groups">
          {groups.map((s) => {
            const issues = data.issues
              .filter((i) => ['STORY', 'TASK', 'BUG'].includes(i.type) && i.sprintId === (s?.id ?? null))
              .sort((a, b) => new Decimal(a.backlogOrder).comparedTo(b.backlogOrder));
            return (
              <PlanningGroup
                key={s?.id ?? 'backlog'}
                id={s?.id ?? ''}
                name={s?.name ?? 'Backlog'}
                items={issues.map((i) => i.id)}
              >
                <header>
                  <ChevronDown size={16} />
                  <h2>{s?.name ?? 'Backlog'}</h2>
                  <span className={`sprint-status ${s?.status === 'ACTIVE' ? 'active' : ''}`}>
                    {s?.status === 'ACTIVE' ? '进行中' : s ? '计划中' : '待规划'}
                  </span>
                  <span className="muted">
                    {issues.length} 个事项 · {issues.reduce((n, i) => n + (i.estimate ?? 0), 0)} SP
                  </span>
                  <div className="toolbar-spacer" />
                  {s && (
                    <>
                      {s.status === 'ACTIVE' ? (
                        <button
                          className="secondary small"
                          disabled={!data.permissions.canWrite}
                          onClick={() => setComplete(s)}
                        >
                          <CheckCircle2 size={13} />
                          完成 Sprint
                        </button>
                      ) : (
                        <>
                          <button
                            className="icon-button"
                            aria-label={`删除 ${s.name}`}
                            onClick={() => setRemove(s)}
                            disabled={busy || !data.permissions.canWrite}
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            className="secondary small"
                            disabled={
                              busy ||
                              !data.permissions.canWrite ||
                              data.sprints.some((s) => s.status === 'ACTIVE')
                            }
                            onClick={() => void command(s, 'start')}
                          >
                            <Play size={12} />
                            启动 Sprint
                          </button>
                        </>
                      )}
                    </>
                  )}
                </header>
                {s?.goal && <p className="sprint-goal">{s.goal}</p>}
                {issues.length ? (
                  issues.map((i) => (
                    <PlanningRow key={i.id} id={i.id} issueKey={i.key}>
                      <TypeIcon type={i.type} />
                      <button className="backlog-title" onClick={() => onOpen(i)}>
                        <span className="issue-key">{i.key}</span>
                        {i.title}
                      </button>
                      {i.epic && <span className="epic-pill">{i.epic.title}</span>}
                      <span className="status-pill">{i.status.name}</span>
                      <PriorityIcon priority={i.priority} />
                      <Avatar actor={i.assignee} small />
                      <span className="estimate-badge">{i.estimate ?? '–'}</span>
                      <SelectField
                        disabled={!data.permissions.canWrite}
                        label={`移动 ${i.key} 到 Sprint`}
                        value={i.sprintId ?? ''}
                        options={[
                          { value: '', label: 'Backlog' },
                          ...data.sprints
                            .filter((s) => s.status !== 'COMPLETED')
                            .map((s) => ({ value: s.id, label: s.name })),
                        ]}
                        onChange={(v) => void mutate(i, { sprintId: v || null }).catch(setError)}
                      />
                    </PlanningRow>
                  ))
                ) : (
                  <div className="sprint-empty">
                    <CalendarDays size={23} />
                    <span>{s ? '这个 Sprint 还没有事项' : 'Backlog 已清空'}</span>
                    <small>通过事项右侧的 Sprint 选择器安排工作</small>
                  </div>
                )}
                <button
                  className="section-create"
                  disabled={!data.permissions.canWrite}
                  onClick={() => onCreate(s?.id)}
                >
                  <Plus size={14} />
                  新建事项
                </button>
              </PlanningGroup>
            );
          })}
        </div>
      </DndContext>
      <Modal
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
        title="删除计划中的 Sprint"
      >
        <p>删除 {remove?.name} 后，其中的事项会移回 Backlog，事项及历史记录都会保留。</p>
        <ErrorNotice error={error} />
        <footer className="modal-footer">
          <button className="secondary" disabled={busy} onClick={() => setRemove(null)}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => remove && void command(remove, 'delete')}
          >
            删除 Sprint
          </button>
        </footer>
      </Modal>
      <Modal open={create} onOpenChange={setCreate} title="创建 Sprint">
        <form onSubmit={newSprint}>
          <label>
            Sprint 名称
            <input name="name" required placeholder="例如：Sprint 02" maxLength={100} />
          </label>
          <label>
            迭代目标
            <textarea name="goal" placeholder="这个迭代希望达成什么？" maxLength={2000} />
          </label>
          <footer className="modal-footer">
            <button className="secondary" type="button" onClick={() => setCreate(false)}>
              取消
            </button>
            <button className="primary" disabled={busy || !data.permissions.canWrite}>
              创建 Sprint
            </button>
          </footer>
        </form>
      </Modal>
      <Modal
        open={!!complete}
        onOpenChange={(v) => {
          if (!v) setComplete(null);
        }}
        title="完成 Sprint"
      >
        <p>已完成事项将保留在 {complete?.name}，未完成事项移动到：</p>
        <SelectField
          disabled={!data.permissions.canWrite}
          label="未完成事项去向"
          value={destination}
          options={[
            { value: '', label: '移回 Backlog' },
            ...data.sprints
              .filter((s) => s.status === 'PLANNED')
              .map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={setDestination}
        />
        <ErrorNotice error={error} />
        <footer className="modal-footer">
          <button className="secondary" onClick={() => setComplete(null)}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy || !data.permissions.canWrite}
            onClick={() => complete && void command(complete, 'complete')}
          >
            确认完成
            <ArrowUpRight size={14} />
          </button>
        </footer>
      </Modal>
    </>
  );
}

function PlanningGroup({
  id,
  name,
  items,
  children,
}: {
  id: string;
  name: string;
  items: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `sprint:${id}` });
  return (
    <section ref={setNodeRef} aria-label={name} className={`sprint-group ${isOver ? 'drop-active' : ''}`}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </section>
  );
}
function PlanningRow({ id, issueKey, children }: { id: string; issueKey: string; children: ReactNode }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="backlog-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <button className="drag-handle" aria-label={`规划 ${issueKey}`} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      {children}
    </div>
  );
}

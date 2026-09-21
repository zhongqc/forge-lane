import { matchesQuick } from '../../../../../packages/shared/src/filters';
import { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Search, SlidersHorizontal, X, ArrowUpRight } from 'lucide-react';
import { api } from '../../lib/api';
import { runIssueCommand } from '../../lib/issue-mutations';
import {
  Avatar,
  TypeIcon,
  PriorityIcon,
  SelectField,
  ErrorNotice,
  MultiSelect,
  priorityLabels,
} from '../../components/ui';
import type { Issue, BoardData } from '../../../../../packages/shared/src/contracts';
export function Card({
  issue,
  onOpen,
  overlay = false,
  readOnly = false,
}: {
  issue: Issue;
  onOpen: (i: Issue) => void;
  overlay?: boolean;
  readOnly?: boolean;
}) {
  const sortable = useSortable({ disabled: readOnly, id: issue.id, data: { statusId: issue.statusId } });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.22 : 1,
        borderTop: sortable.isDragging ? '2px solid #7564ca' : undefined,
      }}
      className={`issue-card ${overlay ? 'drag-overlay' : ''}`}
    >
      <div className="card-top">
        <span className="issue-key">{issue.key}</span>
        <div className="card-top-right">
          <PriorityIcon priority={issue.priority} />
          <button
            className="drag-handle"
            disabled={readOnly}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`拖动 ${issue.key}`}
          >
            <GripVertical size={14} />
          </button>
        </div>
      </div>
      <button className="card-title" onClick={() => onOpen(issue)}>
        {issue.title}
      </button>
      <div className="card-epic">{issue.epic && <span>ϟ {issue.epic.title}</span>}</div>
      <div className="card-bottom">
        <span className="card-type">
          <TypeIcon type={issue.type} />
          {issue.type === 'STORY' ? 'Story' : issue.type === 'BUG' ? 'Bug' : 'Task'}
        </span>
        <div>
          {issue.estimate !== null && <span className="estimate-badge">{issue.estimate}</span>}
          <Avatar actor={issue.assignee} small />
        </div>
      </div>
    </article>
  );
}
function Section({
  id,
  name,
  issues,
  onOpen,
  onCreate,
  overId,
  readOnly,
}: {
  id: string;
  name: string;
  issues: Issue[];
  onOpen: (i: Issue) => void;
  onCreate: (statusId: string) => void;
  overId?: string;
  readOnly: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    disabled: readOnly,
    id: `section:${id}`,
    data: { statusId: id },
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={name}
      className={`status-section ${isOver || overId === id ? 'drop-active' : ''}`}
    >
      <header>
        <span className="status-dot" />
        <h3>{name}</h3>
        <span className="section-count">{issues.length}</span>
        <button
          className="icon-button"
          disabled={readOnly}
          onClick={() => onCreate(id)}
          aria-label={`在 ${name} 新建事项`}
        >
          <Plus size={13} />
        </button>
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="section-cards">
          {issues.map((i) => (
            <Card readOnly={readOnly} key={i.id} issue={i} onOpen={onOpen} />
          ))}
          {!issues.length && <div className="empty-drop">{isOver ? '松开放到这里' : '暂无事项'}</div>}
        </div>
      </SortableContext>
      <button className="section-create" disabled={readOnly} onClick={() => onCreate(id)}>
        <Plus size={13} /> 添加事项
      </button>
    </section>
  );
}
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((hit) => hit.id !== args.active.id);
  return hits.length ? hits : args.pointerCoordinates ? [] : rectIntersection(args);
};
export function BoardPage({
  data,
  onOpen,
  onCreate: create,
  actorId,
}: {
  data: BoardData;
  onOpen: (i: Issue) => void;
  onCreate: (statusId?: string, sprintId?: string) => void;
  actorId: string;
}) {
  const qc = useQueryClient();
  const stored = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`forge:filters:${data.project.id}`) ?? '{}') as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }, [data.project.id]);
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('q') ?? stored.search ?? '');
  const [quick, setQuick] = useState<string[]>(stored.quick?.split(',').filter(Boolean) ?? []);
  const [scope, setScope] = useState(data.sprints.some((s) => s.status === 'ACTIVE') ? 'active' : 'all');
  const [assignee, setAssignee] = useState(stored.assignee ?? '');
  const [epic, setEpic] = useState(stored.epic ?? '');
  const [statusFilters, setStatusFilters] = useState(stored.statusFilters ?? '');
  const [priorityFilters, setPriorityFilters] = useState(stored.priorityFilters ?? '');
  const [labelFilters, setLabelFilters] = useState(stored.labelFilters ?? '');
  useEffect(() => {
    sessionStorage.setItem(
      `forge:filters:${data.project.id}`,
      JSON.stringify({
        search,
        quick: quick.join(','),
        assignee,
        epic,
        statusFilters,
        priorityFilters,
        labelFilters,
      }),
    );
    if (!location.pathname.startsWith('/issues/')) {
      const params = new URLSearchParams(location.search);
      if (search) params.set('q', search);
      else params.delete('q');
      history.replaceState(
        history.state,
        '',
        location.pathname + (params.size ? '?' + params.toString() : ''),
      );
    }
  }, [search, quick, assignee, epic, statusFilters, priorityFilters, labelFilters, data.project.id]);
  const [filters, setFilters] = useState(false);
  const [active, setActive] = useState<Issue | null>(null);
  const [target, setTarget] = useState<string>();
  const [projection, setProjection] = useState<Issue[] | null>(null);
  const [error, setError] = useState<unknown>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onCreate = (statusId?: string) => {
    if (data.permissions.canWrite) create(statusId, scope === 'active' ? activeSprint?.id : undefined);
  };
  const activeSprint = data.sprints.find((s) => s.status === 'ACTIVE');
  const visible = useMemo(
    () =>
      (projection ?? data.issues)
        .filter((i) => ['STORY', 'TASK', 'BUG'].includes(i.type))
        .filter(
          (i) =>
            (scope === 'all' || i.sprintId === activeSprint?.id) &&
            (!assignee || assignee.split(',').includes(i.assigneeId ?? '')) &&
            (!epic || epic.split(',').includes(i.epicId ?? '')) &&
            (!statusFilters || statusFilters.split(',').includes(i.statusId)) &&
            (!priorityFilters || priorityFilters.split(',').includes(i.priority)) &&
            (!labelFilters || i.labels.some((l) => labelFilters.split(',').includes(l.label.id))),
        )
        .filter(
          (i) =>
            !search || `${i.key} ${i.title} ${i.description}`.toLowerCase().includes(search.toLowerCase()),
        )
        .filter((i) => matchesQuick(i, quick, actorId)),
    [
      projection,
      data.issues,
      scope,
      activeSprint,
      assignee,
      epic,
      search,
      quick,
      actorId,
      statusFilters,
      priorityFilters,
      labelFilters,
    ],
  );
  function project(e: DragOverEvent) {
    if (!active || !e.over) {
      setTarget(undefined);
      setProjection(null);
      return;
    }
    const over = String(e.over.id);
    if (over === active.id) {
      setTarget((projection ?? data.issues).find((i) => i.id === active.id)?.statusId);
      return;
    }
    const statusId = over.startsWith('section:')
      ? over.slice(8)
      : (projection ?? data.issues).find((i) => i.id === over)?.statusId;
    if (!statusId) return;
    setTarget(statusId);
    const items = (projection ?? data.issues).filter((i) => i.id !== active.id);
    const index = items.findIndex((i) => i.id === over);
    const translated = e.active.rect.current.translated;
    const after =
      index >= 0 && translated
        ? translated.top + translated.height / 2 > e.over.rect.top + e.over.rect.height / 2
        : false;
    items.splice(index >= 0 ? index + (after ? 1 : 0) : items.length, 0, { ...active, statusId });
    if (
      projection?.length === items.length &&
      items.every(
        (item, index) => item.id === projection[index].id && item.statusId === projection[index].statusId,
      )
    )
      return;
    setProjection(items);
  }
  async function end(e: DragEndEvent) {
    const moving = active;
    const destination = target;
    const projected = projection;
    setActive(null);
    setTarget(undefined);
    setProjection(null);
    if (!moving || !e.over || !destination) return;
    const order = (projected ?? data.issues).filter(
      (i) =>
        i.statusId === destination &&
        i.sprintId === moving.sprintId &&
        ['STORY', 'TASK', 'BUG'].includes(i.type),
    );
    const idx = order.findIndex((i) => i.id === moving.id);
    const column = data.columns.find((c) => c.statuses.some((s) => s.statusId === destination));
    if (!column) return;
    const before = data.issues.find((i) => i.id === moving.id)!;
    qc.setQueryData<BoardData>(['board', data.project.id], (b) =>
      b
        ? {
            ...b,
            issues: [
              ...(projected ?? b.issues),
              ...b.issues.filter((i) => projected && !projected.some((p) => p.id === i.id)),
            ].map((i) => {
              const latest = b.issues.find((item) => item.id === i.id) ?? i;
              return i.id === moving.id ? { ...latest, statusId: destination } : latest;
            }),
          }
        : b,
    );
    try {
      const result = await runIssueCommand(qc, moving, (current) =>
        api<Issue>(
          `/projects/${data.project.id}/board/moves`,
          'POST',
          {
            issueId: moving.id,
            version: current.version,
            targetColumnId: column.id,
            targetStatusId: destination,
            previousIssueId: order[idx - 1]?.id ?? null,
            nextIssueId: order[idx + 1]?.id ?? null,
          },
          crypto.randomUUID(),
        ),
      );
      qc.setQueryData(['issue', moving.key], result);
      setError(null);
    } catch (err) {
      setError(err);
      qc.setQueryData<BoardData>(['board', data.project.id], (b) =>
        b
          ? {
              ...b,
              issues: b.issues.map((i) => (i.id === before.id && i.version === before.version ? before : i)),
            }
          : b,
      );
    } finally {
      void qc.invalidateQueries({ queryKey: ['board', data.project.id] });
    }
  }
  const toggle = (v: string) => setQuick((q) => (q.includes(v) ? q.filter((x) => x !== v) : [...q, v]));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE PROGRESS, TOGETHER</div>
          <h1>
            团队看板{' '}
            <span>{data.issues.filter((i) => ['STORY', 'TASK', 'BUG'].includes(i.type)).length}</span>
          </h1>
          <p>把重要的事，推进到下一步。</p>
        </div>
        <button className="primary" disabled={!data.permissions.canWrite} onClick={() => onCreate()}>
          <Plus size={16} />
          新建事项 <kbd>C</kbd>
        </button>
      </div>
      <div className="board-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索事项、编号或描述…"
            aria-label="搜索事项"
          />
          <kbd>/</kbd>
        </div>
        <div className="toolbar-divider" />
        <button
          className={`filter-chip ${quick.includes('mine') ? 'selected' : ''}`}
          onClick={() => toggle('mine')}
        >
          我的事项
        </button>
        <button
          className={`filter-chip ${quick.includes('BUG') ? 'selected' : ''}`}
          onClick={() => toggle('BUG')}
        >
          <TypeIcon type="BUG" />
          Bug
        </button>
        <button className={`filter-chip ${filters ? 'selected' : ''}`} onClick={() => setFilters(!filters)}>
          <SlidersHorizontal size={14} />
          筛选{quick.length > 0 && <span className="tiny-count">{quick.length}</span>}
        </button>
        <div className="toolbar-spacer" />
        <div className="avatar-stack">
          {data.members.slice(0, 4).map((a) => (
            <Avatar key={a.id} actor={a} small />
          ))}
        </div>
        <SelectField
          label="看板范围"
          value={scope}
          options={[
            { value: 'all', label: '全部事项' },
            ...(activeSprint ? [{ value: 'active', label: activeSprint.name }] : []),
          ]}
          onChange={setScope}
        />
      </div>
      {filters && (
        <div className="expanded-filters">
          {[
            ['STORY', 'Story'],
            ['TASK', 'Task'],
            ['unassigned', '未分配'],
            ['high', '高优先级'],
            ['noestimate', '未估点'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`filter-chip ${quick.includes(v) ? 'selected' : ''}`}
              onClick={() => toggle(v)}
            >
              {l}
            </button>
          ))}
          <MultiSelect
            label="负责人"
            value={assignee}
            options={[
              { value: '', label: '所有负责人' },
              ...data.members.map((m) => ({ value: m.id, label: m.name })),
            ]}
            onChange={setAssignee}
          />
          <MultiSelect
            label="Epic"
            value={epic}
            options={[
              { value: '', label: '所有 Epic' },
              ...data.issues.filter((i) => i.type === 'EPIC').map((i) => ({ value: i.id, label: i.title })),
            ]}
            onChange={setEpic}
          />
          <MultiSelect
            label="状态"
            value={statusFilters}
            onChange={setStatusFilters}
            options={data.statuses.map((s) => ({ value: s.id, label: s.name }))}
          />
          <MultiSelect
            label="优先级"
            value={priorityFilters}
            onChange={setPriorityFilters}
            options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))}
          />
          <MultiSelect
            label="标签"
            value={labelFilters}
            onChange={setLabelFilters}
            options={data.labels.map((l) => ({ value: l.id, label: l.name }))}
          />
          <button
            className="text-button"
            onClick={() => {
              setQuick([]);
              setStatusFilters('');
              setPriorityFilters('');
              setLabelFilters('');
              setAssignee('');
              setEpic('');
              setSearch('');
            }}
          >
            <X size={12} />
            清除筛选
          </button>
        </div>
      )}
      <ErrorNotice error={error} />
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={(e) => {
          if (!data.permissions.canWrite) return;
          setActive(data.issues.find((i) => i.id === e.active.id) ?? null);
          setProjection(null);
        }}
        onDragMove={project}
        onDragEnd={end}
        onDragCancel={() => {
          setActive(null);
          setProjection(null);
          setTarget(undefined);
        }}
      >
        <div className="board-columns">
          {data.columns.map((col, index) => (
            <div className={`board-column column-${index}`} key={col.id}>
              <div className="column-heading">
                <span className="column-marker" />
                <h2>{col.name}</h2>
                <span>
                  {visible.filter((i) => col.statuses.some((s) => s.statusId === i.statusId)).length}
                </span>
                <button
                  className="icon-button"
                  disabled={!data.permissions.canWrite}
                  aria-label={`在${col.name}新建事项`}
                  onClick={() => onCreate(col.statuses[0]?.statusId)}
                >
                  <Plus size={16} />
                </button>
              </div>
              {col.statuses.map((m) => {
                const s = data.statuses.find((s) => s.id === m.statusId);
                return s ? (
                  <Section
                    key={s.id}
                    id={s.id}
                    name={s.name}
                    issues={visible.filter((i) => i.statusId === s.id)}
                    onOpen={onOpen}
                    onCreate={onCreate}
                    overId={target}
                    readOnly={!data.permissions.canWrite}
                  />
                ) : null;
              })}
            </div>
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className="overlay-card">
              <span>{active.key}</span>
              <strong>{active.title}</strong>
              <ArrowUpRight size={16} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <div className="board-footer">
        <span>
          <span className="live-dot" />
          所有更改自动同步
        </span>
        <span>拖拽推进事项 · 点击卡片查看详情</span>
      </div>
    </>
  );
}

import { CurrentSprintPoints } from '../sprints/SprintOverview';
import { matchesQuick } from '../../../../../packages/shared/src/filters';
import { useMemo, useState, useEffect, useRef } from 'react';
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
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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
function CardContent({
  issue,
  onOpen,
  handle,
}: {
  issue: Issue;
  onOpen: (issue: Issue) => void;
  handle?: React.ReactNode;
}) {
  return (
    <>
      <div className="card-top">
        <span className="issue-key">{issue.key}</span>
        <div className="card-top-right">
          <span className={`card-status category-${issue.status.category}`} title={issue.status.name}>
            {issue.status.name}
          </span>
          <PriorityIcon priority={issue.priority} />
          {handle}
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
    </>
  );
}
export function Card({
  issue,
  onOpen,
  readOnly = false,
  columnId,
  receiving = false,
}: {
  issue: Issue;
  onOpen: (i: Issue) => void;
  readOnly?: boolean;
  columnId: string;
  receiving?: boolean;
}) {
  const sortable = useSortable({
    disabled: { draggable: readOnly, droppable: readOnly || receiving },
    id: issue.id,
    data: { kind: 'card', columnId, statusId: issue.statusId },
  });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{ opacity: sortable.isDragging ? 0.25 : 1 }}
      onPointerDownCapture={(e) => sortable.listeners?.onPointerDown?.(e)}
      className={`issue-card ${readOnly ? '' : 'draggable-card'}`}
    >
      <CardContent
        issue={issue}
        onOpen={onOpen}
        handle={
          <button
            className="card-drag-surface"
            disabled={readOnly}
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`拖动 ${issue.key}`}
          />
        }
      />
    </article>
  );
}
function StatusDropZone({
  status,
  columnId,
  selected,
}: {
  status: BoardData['statuses'][number];
  columnId: string;
  selected: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `transition:${status.id}`,
    data: { kind: 'transition', columnId, statusId: status.id },
  });
  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`移至 ${status.name}`}
      className={`status-drop-zone ${selected || isOver ? 'selected' : ''}`}
    >
      <span className={`drop-status-dot category-${status.category}`} />
      <strong>{status.name}</strong>
      <span>{selected || isOver ? '松手切换到此状态' : '拖到这里'}</span>
    </div>
  );
}
function BoardColumn({
  column,
  index,
  statuses,
  issues,
  active,
  sourceColumnId,
  target,
  insertBefore,
  readOnly,
  onOpen,
}: {
  column: BoardData['columns'][number];
  index: number;
  statuses: BoardData['statuses'];
  issues: Issue[];
  active: Issue | null;
  sourceColumnId?: string;
  target?: string;
  insertBefore?: string | null;
  readOnly: boolean;
  onOpen: (issue: Issue) => void;
}) {
  const receiving = !!active && sourceColumnId !== column.id;
  const { setNodeRef } = useDroppable({
    id: `column:${column.id}`,
    disabled: readOnly || receiving,
    data: { kind: 'column', columnId: column.id },
  });
  return (
    <section
      aria-label={column.name}
      className={`board-column column-${index} ${receiving ? 'is-receiving' : ''}`}
    >
      <div className="column-heading">
        <span className="column-marker" />
        <h2>{column.name}</h2>
        <span>{issues.length}</span>
      </div>
      <div ref={setNodeRef} className="column-scroll">
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="section-cards">
            {issues.map((issue) => (
              <div className="card-slot" key={issue.id}>
                {!receiving && target === active?.statusId && insertBefore === issue.id && (
                  <div className="drop-indicator" aria-label="放到这里" />
                )}
                <Card
                  issue={issue}
                  onOpen={onOpen}
                  readOnly={readOnly}
                  receiving={receiving}
                  columnId={column.id}
                />
              </div>
            ))}
            {!receiving &&
              column.id === sourceColumnId &&
              target === active?.statusId &&
              insertBefore === null && (
                <div className="drop-indicator drop-indicator-end" aria-label="放到这里" />
              )}
            {!issues.length && <div className="empty-drop">暂无事项</div>}
          </div>
        </SortableContext>
      </div>
      {receiving && (
        <div className="column-drop-zones" aria-label={`${column.name}可用状态`}>
          <p>选择目标状态</p>
          {column.statuses.map((mapping) => {
            const status = statuses.find((item) => item.id === mapping.statusId);
            return status ? (
              <StatusDropZone
                key={status.id}
                status={status}
                columnId={column.id}
                selected={target === status.id}
              />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}
const collision: CollisionDetection = (args) => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const transitions = hits.filter((hit) => String(hit.id).startsWith('transition:'));
  if (transitions.length) return transitions;
  const cards = hits.filter((hit) => !String(hit.id).startsWith('column:'));
  if (cards.length) return cards;
  const column = hits.find((hit) => String(hit.id).startsWith('column:'));
  if (column && args.pointerCoordinates) {
    const columnId = String(column.id).slice(7);
    const nearby = args.droppableContainers
      .filter(
        (container) =>
          container.data.current?.kind === 'card' && container.data.current?.columnId === columnId,
      )
      .flatMap((container) => {
        const rect = args.droppableRects.get(container.id);
        return rect ? [{ id: container.id, rect }] : [];
      });
    const y = args.pointerCoordinates.y;
    if (
      y >= Math.min(...nearby.map((item) => item.rect.top)) &&
      y <= Math.max(...nearby.map((item) => item.rect.bottom))
    ) {
      nearby.sort(
        (a, b) => Math.abs(y - a.rect.top - a.rect.height / 2) - Math.abs(y - b.rect.top - b.rect.height / 2),
      );
      if (nearby[0]) return [{ id: nearby[0].id }];
    }
  }
  return hits;
};
// Navigate explicit card/empty-section targets, excluding the current target. The generic
// sortable getter can choose the current card again when nested sections share its bounds.
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const currentId = context.over?.id ?? context.active?.id;
  const current = currentId ? context.droppableRects.get(currentId) : context.collisionRect;
  if (!current) return;
  const containers = context.droppableContainers.getEnabled();
  const candidates = containers.flatMap((container) => {
    if (container.id === currentId) return [];
    if (
      container.data.current?.kind === 'column' &&
      containers.some(
        (card) =>
          card.data.current?.kind === 'card' &&
          card.data.current?.columnId === container.data.current?.columnId,
      )
    )
      return [];
    const rect = context.droppableRects.get(container.id);
    if (!rect) return [];
    const dx = rect.left + rect.width / 2 - current.left - current.width / 2;
    const dy = rect.top + rect.height / 2 - current.top - current.height / 2;
    const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    const forward = event.code === 'ArrowRight' || event.code === 'ArrowDown';
    const distance = horizontal ? dx : dy;
    if ((forward ? distance <= 1 : distance >= -1) || (!horizontal && Math.abs(dx) > current.width / 2))
      return [];
    return [{ rect, score: Math.abs(distance) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2 }];
  });
  candidates.sort((a, b) => a.score - b.score);
  const target = candidates[0]?.rect;
  return target ? { x: target.left, y: target.top } : undefined;
};
export function BoardPage({
  data,
  onOpen,
  actorId,
}: {
  data: BoardData;
  onOpen: (i: Issue) => void;
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
  const [insertBefore, setInsertBefore] = useState<string | null>();
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [projection, setProjection] = useState<Issue[] | null>(null);
  const [error, setError] = useState<unknown>();
  const boardElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let previousTime = 0;
    const velocity = (position: number, start: number, end: number) => {
      const edge = Math.min(64, (end - start) / 4);
      if (position < start + edge) return -16 * Math.max(0, 1 - (position - start) / edge);
      if (position > end - edge) return 16 * Math.max(0, 1 - (end - position) / edge);
      return 0;
    };
    const scroll = (time: number) => {
      const element = boardElement.current;
      const point = pointer.current;
      const scale = previousTime ? Math.min((time - previousTime) / 16.67, 2) : 1;
      previousTime = time;
      if (element && point) {
        const bounds = element.getBoundingClientRect();
        const top = Math.max(bounds.top, 0);
        const bottom = Math.min(bounds.bottom, window.innerHeight);
        if (point.x >= bounds.left && point.x <= bounds.right && point.y >= top && point.y <= bottom) {
          element.scrollLeft += velocity(point.x, bounds.left, bounds.right) * scale;
          for (const column of element.querySelectorAll<HTMLElement>('.column-scroll')) {
            const rect = column.getBoundingClientRect();
            if (point.x >= rect.left && point.x <= rect.right) {
              if (column.closest('.is-receiving')) break;
              column.scrollTop +=
                velocity(point.y, Math.max(rect.top, top), Math.min(rect.bottom, bottom)) * scale;
              break;
            }
          }
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );
  const activeSprint = data.sprints.find((s) => s.status === 'ACTIVE');
  const visible = useMemo(
    () =>
      data.issues
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
  const sourceColumnId = active
    ? data.columns.find((column) => column.statuses.some((status) => status.statusId === active.statusId))?.id
    : undefined;
  function project(e: DragOverEvent) {
    const reset = () => {
      setTarget(undefined);
      setProjection(null);
      setInsertBefore(undefined);
    };
    if (!active || !e.over || e.over.id === active.id) {
      reset();
      return;
    }
    const drop = e.over.data.current;
    if (!drop) {
      reset();
      return;
    }
    if (drop.kind === 'transition') {
      if (drop.columnId === sourceColumnId) {
        reset();
        return;
      }
      const status = data.statuses.find((item) => item.id === drop.statusId);
      if (!status) {
        reset();
        return;
      }
      setTarget(status.id);
      setInsertBefore(undefined);
      setProjection([
        ...data.issues.filter((i) => i.id !== active.id),
        { ...active, statusId: status.id, status },
      ]);
      return;
    }
    if (drop.columnId !== sourceColumnId) {
      reset();
      return;
    }
    setTarget(active.statusId);
    const column = data.columns.find((item) => item.id === sourceColumnId)!;
    const candidates = visible.filter(
      (i) => i.id !== active.id && column.statuses.some((status) => status.statusId === i.statusId),
    );
    const translated = e.active.rect.current.translated;
    const y = pointer.current?.y ?? (translated ? translated.top + translated.height / 2 : 0);
    let next: Issue | undefined;
    if (drop.kind === 'column') {
      if (y < e.over.rect.top + 20) next = candidates[0];
    } else {
      const index = candidates.findIndex((i) => i.id === e.over!.id);
      if (index < 0) {
        reset();
        return;
      }
      const after = pointer.current ? y > e.over.rect.top + e.over.rect.height / 2 : e.delta.y > 0;
      next = candidates[index + (after ? 1 : 0)];
    }
    setInsertBefore(next?.id ?? null);
    const items = data.issues.filter((i) => i.id !== active.id);
    const index = next ? items.findIndex((i) => i.id === next.id) : -1;
    items.splice(index >= 0 ? index : items.length, 0, active);
    if (
      projection?.length === items.length &&
      items.every((item, i) => item.id === projection[i].id && item.statusId === projection[i].statusId)
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
    setInsertBefore(undefined);
    pointer.current = null;
    if (!moving || !e.over || !destination) return;
    const column = data.columns.find((c) => c.statuses.some((s) => s.statusId === destination));
    if (!column) return;
    const intent = column.id === sourceColumnId ? 'rank' : 'transition';
    const inRankGroup = (i: Issue) =>
      column.statuses.some((s) => s.statusId === i.statusId) &&
      i.sprintId === moving.sprintId &&
      ['STORY', 'TASK', 'BUG'].includes(i.type);
    const order = (projected ?? data.issues).filter(inRankGroup);
    const idx = order.findIndex((i) => i.id === moving.id);
    const original = data.issues.filter(inRankGroup);
    const originalIndex = original.findIndex((i) => i.id === moving.id);
    if (
      intent === 'rank' &&
      original[originalIndex - 1]?.id === order[idx - 1]?.id &&
      original[originalIndex + 1]?.id === order[idx + 1]?.id
    )
      return;
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
              return i.id === moving.id
                ? {
                    ...latest,
                    statusId: destination,
                    status: data.statuses.find((status) => status.id === destination)!,
                  }
                : latest;
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
            intent,
            issueId: moving.id,
            version: current.version,
            targetColumnId: column.id,
            targetStatusId: destination,
            ...(intent === 'rank'
              ? { previousIssueId: order[idx - 1]?.id ?? null, nextIssueId: order[idx + 1]?.id ?? null }
              : {}),
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
      <CurrentSprintPoints data={data} />
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
        autoScroll={false}
        collisionDetection={(args) => {
          pointer.current = args.pointerCoordinates;
          return collision(args);
        }}
        onDragStart={(e) => {
          if (!data.permissions.canWrite) return;
          setActive(data.issues.find((i) => i.id === e.active.id) ?? null);
          setProjection(null);
          setInsertBefore(undefined);
          const event = e.activatorEvent;
          pointer.current =
            'clientY' in event
              ? { x: (event as PointerEvent).clientX, y: (event as PointerEvent).clientY }
              : null;
        }}
        onDragMove={project}
        onDragOver={project}
        onDragEnd={end}
        onDragCancel={() => {
          setActive(null);
          setProjection(null);
          setTarget(undefined);
          setInsertBefore(undefined);
          pointer.current = null;
        }}
      >
        <div ref={boardElement} className={`board-columns ${active ? 'is-dragging' : ''}`}>
          {data.columns.map((col, index) => (
            <BoardColumn
              key={col.id}
              column={col}
              index={index}
              statuses={data.statuses}
              issues={visible.filter((i) => col.statuses.some((status) => status.statusId === i.statusId))}
              active={active}
              sourceColumnId={sourceColumnId}
              target={target}
              insertBefore={insertBefore}
              readOnly={!data.permissions.canWrite}
              onOpen={onOpen}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active && (
            <article className="issue-card drag-preview">
              <CardContent issue={active} onOpen={() => {}} />
            </article>
          )}
        </DragOverlay>
      </DndContext>
      <div className="board-footer">
        <span>
          <span className="live-dot" />
          所有更改自动同步
        </span>
        <span>列内拖动排序 · 跨列选择状态 · 点击标题查看详情</span>
      </div>
    </>
  );
}

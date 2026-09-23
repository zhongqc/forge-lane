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
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { CardContent } from './BoardCard';
import { BoardColumn } from './BoardColumn';
import { boardCollision, boardKeyboardCoordinates } from './board-dnd';
import { Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { runIssueCommand } from '../../lib/issue-mutations';
import { Avatar, TypeIcon, SelectField, ErrorNotice, MultiSelect, priorityLabels } from '../../components/ui';
import type { Issue, BoardData } from '../../../../../packages/shared/src/contracts';
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
          <h1>
            看板 <span>{data.issues.filter((i) => ['STORY', 'TASK', 'BUG'].includes(i.type)).length}</span>
          </h1>
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
        <div className="toolbar-spacer" />
        <CurrentSprintPoints data={data} presentation="drawer" />
        <div className="avatar-stack" role="group" aria-label="按负责人筛选">
          {data.members.slice(0, 4).map((a) => (
            <button
              key={a.id}
              className="avatar-filter"
              aria-label={`筛选负责人：${a.name}`}
              aria-pressed={assignee.split(',').includes(a.id)}
              title={`筛选 ${a.name} 的事项（可多选）`}
              onClick={() =>
                setAssignee((current) => {
                  const selected = current.split(',').filter(Boolean);
                  return selected.includes(a.id)
                    ? selected.filter((id) => id !== a.id).join(',')
                    : [...selected, a.id].join(',');
                })
              }
            >
              <Avatar actor={a} small />
            </button>
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
      <div className="board-filters" role="group" aria-label="筛选事项">
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
          disabled={
            !search &&
            !quick.length &&
            !assignee &&
            !epic &&
            !statusFilters &&
            !priorityFilters &&
            !labelFilters
          }
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
      <ErrorNotice error={error} />
      <DndContext
        sensors={sensors}
        autoScroll={false}
        collisionDetection={(args) => {
          pointer.current = args.pointerCoordinates;
          return boardCollision(args);
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
    </>
  );
}

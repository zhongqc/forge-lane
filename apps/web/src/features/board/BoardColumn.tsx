import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card } from './BoardCard';
import type { Issue, BoardData } from '../../../../../packages/shared/src/contracts';
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
export function BoardColumn({
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

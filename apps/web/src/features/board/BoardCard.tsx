import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { Avatar, TypeIcon, PriorityIcon } from '../../components/ui';
import type { Issue } from '../../../../../packages/shared/src/contracts';
export function CardContent({
  issue,
  onOpen,
  handle,
}: {
  issue: Issue;
  onOpen: (issue: Issue) => void;
  handle?: ReactNode;
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
  const { setNodeRef, setActivatorNodeRef, isDragging, listeners, attributes } = useSortable({
    disabled: { draggable: readOnly, droppable: readOnly || receiving },
    id: issue.id,
    data: { kind: 'card', columnId, statusId: issue.statusId },
  });
  const { onPointerDown, ...handleListeners } = listeners ?? {};
  return (
    <article
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.25 : 1 }}
      onPointerDown={(event) => onPointerDown?.(event)}
      className={`issue-card ${readOnly ? '' : 'draggable-card'}`}
    >
      <CardContent
        issue={issue}
        onOpen={onOpen}
        handle={
          <button
            ref={setActivatorNodeRef}
            className="card-drag-handle"
            disabled={readOnly}
            {...attributes}
            {...handleListeners}
            aria-label={`拖动 ${issue.key}`}
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </article>
  );
}

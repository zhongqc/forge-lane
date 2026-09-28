import { useSortable } from '@dnd-kit/sortable';
import { Avatar, TypeIcon, PriorityIcon } from '../../components/ui';
import type { Issue } from '../../../../../packages/shared/src/contracts';
export function CardContent({ issue, onOpen }: { issue: Issue; onOpen: (issue: Issue) => void }) {
  return (
    <>
      <div className="card-top">
        <span className="issue-key">{issue.key}</span>
        <div className="card-top-right">
          <span className={`card-status category-${issue.status.category}`} title={issue.status.name}>
            {issue.status.name}
          </span>
          <PriorityIcon priority={issue.priority} />
        </div>
      </div>
      <button
        className="card-title"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(issue);
        }}
      >
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
  const { onKeyDown: dragKeyDown, ...dragListeners } = listeners ?? {};
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      {...attributes}
      {...dragListeners}
      role="button"
      tabIndex={0}
      aria-label={`拖动 ${issue.key}`}
      title="点击打开事项详情，按空格拖动卡片"
      onClick={() => onOpen(issue)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(issue);
        } else dragKeyDown?.(event);
      }}
      style={{ opacity: isDragging ? 0.25 : 1 }}
      className={`issue-card ${readOnly ? '' : 'draggable-card'}`}
    >
      <CardContent issue={issue} onOpen={onOpen} />
    </div>
  );
}

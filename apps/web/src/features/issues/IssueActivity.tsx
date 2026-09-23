import { GitHubActivity, githubUrl } from '../github/IssueDevelopment';
import { MarkdownView } from '../../components/MarkdownView';
import { priorityLabels } from '../../components/ui';
import type { Activity, BoardData, Priority } from '../../../../../packages/shared/src/contracts';
export function IssueActivity({ activities, board }: { activities: Activity[]; board: BoardData }) {
  return (
    <div className="activity-list">
      {activities.map((a) => (
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
            <time>
              {new Intl.DateTimeFormat('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(a.occurredAt))}
            </time>
          </div>
        </div>
      ))}
    </div>
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
    estimate: 'Story Points',
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
      {summary && <MarkdownView markdown={summary} />}
      {pr && (
        <a href={pr} target="_blank" rel="noreferrer">
          查看 Pull Request
        </a>
      )}
    </>
  );
}

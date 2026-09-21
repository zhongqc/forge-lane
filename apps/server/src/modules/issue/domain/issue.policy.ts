export interface IssueShape {
  type: string;
  parentId?: string | null;
  epicId?: string | null;
  sprintId?: string | null;
  estimate?: number | null;
}
export function assertIssueShape(issue: IssueShape): void {
  if (
    issue.estimate != null &&
    (!Number.isFinite(issue.estimate) || issue.estimate < 0 || issue.estimate > 100000)
  )
    throw new Error('估点必须在 0 到 100000 之间');
  if (issue.type === 'EPIC' && (issue.parentId || issue.epicId || issue.sprintId || issue.estimate != null))
    throw new Error('Epic 不能有父事项、所属 Epic、Sprint 或独立估点');
  if (issue.type === 'SUBTASK') {
    if (!issue.parentId) throw new Error('子任务必须选择父事项');
    if (issue.epicId || issue.sprintId || issue.estimate != null)
      throw new Error('子任务从父事项继承 Epic 和 Sprint，不独立估点');
  } else if (issue.parentId) throw new Error('只有子任务能有父事项');
}

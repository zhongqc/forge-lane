export const ISSUE_TYPES = ['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type Priority = (typeof PRIORITIES)[number];
export interface Actor {
  id: string;
  name: string;
  color: string;
  avatarKey?: string | null;
  kind: string;
}
export interface ActorContext {
  actorId: string;
  workspaceId: string;
  actorName: string;
  source: 'WEB' | 'API' | 'SYSTEM';
  requestId: string;
  token?: { id: string; name: string; projectIds: string[]; scopes: string[]; expiresAt: Date };
}
export interface Status {
  id: string;
  name: string;
  category: 'TODO' | 'IN_PROGRESS' | 'DONE';
  sortOrder: number;
}
export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  version: number;
  startAt: string | null;
  endAt: string | null;
}
export interface Label {
  id: string;
  name: string;
  color: string;
}
export interface Issue {
  id: string;
  key: string;
  projectId: string;
  number: number;
  type: IssueType;
  title: string;
  description: string;
  statusId: string;
  status: Status;
  priority: Priority;
  assigneeId: string | null;
  assignee: Actor | null;
  reporter: Actor;
  epicId: string | null;
  epic: Pick<Issue, 'id' | 'key' | 'title'> | null;
  parentId: string | null;
  parent: Pick<Issue, 'id' | 'key' | 'title'> | null;
  sprintId: string | null;
  effectiveSprintId: string | null;
  effectiveEpicId: string | null;
  estimate: number | null;
  boardOrder: string;
  backlogOrder: string;
  version: number;
  labels: { label: Label }[];
  children: Issue[];
  createdAt: string;
  updatedAt: string;
}
export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  workspaceId: string;
  version: number;
}
export interface BoardData {
  permissions: { canWrite: boolean; canAdmin: boolean };
  project: Project;
  statuses: Status[];
  columns: {
    id: string;
    name: string;
    sortOrder: number;
    statuses: { statusId: string; sortOrder: number }[];
  }[];
  issues: Issue[];
  sprints: Sprint[];
  members: Actor[];
  labels: Label[];
}
export interface Activity {
  id: string;
  type: string;
  actorNameSnapshot: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}
export interface Comment {
  id: string;
  content: string;
  version: number;
  actor: Actor;
  actorId: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface SprintOverviewIssue {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  statusName: string;
  done: boolean;
  assigneeId: string | null;
  assigneeName: string;
  estimate: number | null;
}
export interface SprintMemberPoints {
  actorId: string | null;
  name: string;
  issues: number;
  unestimated: number;
  total: number;
  completed: number;
  remaining: number;
}
export interface SprintOverview {
  sprint: Sprint;
  snapshotAt: string | null;
  completeSnapshot: boolean;
  issues: SprintOverviewIssue[];
  members: SprintMemberPoints[];
}

import { z } from 'zod';
export const statuses = [
  'Backlog',
  'Todo',
  'In Progress',
  'In Review',
  'Ready to Merge',
  'Done',
  'Cancelled',
] as const;
export const kinds = ['CODE', 'MANUAL', 'GROUP'] as const;
export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const taskFieldsSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(200000),
  acceptanceCriteria: z.string().max(20000),
  priority: z.enum(priorities),
  labels: z
    .array(z.string().trim().min(1).max(60))
    .max(30)
    .transform((v) => [...new Set(v)]),
  dependencies: z
    .array(z.uuid())
    .max(500)
    .transform((v) => [...new Set(v)].sort()),
  parentId: z.uuid().nullable(),
});
const mutation = { requestId: z.uuid() };
const existing = { ...mutation, taskId: z.uuid(), expectedVersion: z.number().int().positive() };
const parentVersions = z.record(z.uuid(), z.number().int().positive());
export const taskCreateSchema = taskFieldsSchema
  .extend({
    ...mutation,
    method: z.literal('task.create'),
    projectId: z.uuid(),
    kind: z.enum(kinds),
    status: z.enum(['Backlog', 'Todo']),
    parentVersions,
  })
  .strict();
export const taskCommandSchemas = [
  taskCreateSchema,
  z
    .object({
      ...existing,
      method: z.literal('task.reparent'),
      parentId: z.uuid().nullable(),
      parentVersions,
    })
    .strict(),
  taskFieldsSchema.extend({ ...existing, method: z.literal('task.update'), parentVersions }).strict(),
  z
    .object({
      ...existing,
      method: z.literal('task.action'),
      action: z.enum(['backlog', 'todo', 'start', 'accept', 'cancel', 'archive']),
    })
    .strict(),
  z
    .object({
      ...existing,
      method: z.literal('task.reorder'),
      targetId: z.uuid(),
      targetVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      method: z.literal('project.update'),
      ...mutation,
      projectId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(20000),
    })
    .strict(),
] as const;
export const taskCommandSchema = z.discriminatedUnion('method', taskCommandSchemas);
export type TaskCommand = z.infer<typeof taskCommandSchema>;
export type TaskFields = z.infer<typeof taskFieldsSchema>;
export type TaskStatus = (typeof statuses)[number];
export type TaskKind = (typeof kinds)[number];
export type Action =
  | 'reparent'
  | 'edit'
  | 'backlog'
  | 'todo'
  | 'start'
  | 'accept'
  | 'cancel'
  | 'archive'
  | 'reorder';
export type AllowedActions = Record<Action, { allowed: boolean; reason: string }>;
export type Task = TaskFields & {
  id: string;
  projectId: string;
  number: number;
  kind: TaskKind;
  status: TaskStatus;
  position: number;
  version: number;
  requirementRevisionId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  allowedActions: AllowedActions;
  blockedReasons: string[];
  progress: { done: number; total: number };
};
export type Revision = {
  id: string;
  taskId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  dependencies: string[];
  author: string;
  createdAt: string;
};
export type Activity = { seq: number; type: string; timestamp: string; summary: string };
export type Board = { tasks: Task[]; eventCursor: number };
export type TaskDetail = { task: Task; revisions: Revision[]; activities: Activity[] };

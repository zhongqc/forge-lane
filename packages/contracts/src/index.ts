import { taskCommandSchemas, type TaskCommand, type Board, type TaskDetail, type Task } from './tasks';
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
const toolPath = z
  .string()
  .max(4096)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !value.includes('\0')),
    '请选择绝对可执行文件路径',
  );
export const settingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    fontSize: z.number().int().min(12).max(24),
    gitPath: toolPath,
    ghPath: toolPath,
    codexPath: toolPath,
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  theme: 'system',
  fontSize: 14,
  gitPath: '',
  ghPath: '',
  codexPath: '',
};
export const commandSchema = z.discriminatedUnion('method', [
  ...taskCommandSchemas,
  z.object({ method: z.literal('task.board'), projectId: z.uuid() }).strict(),
  z
    .object({ method: z.literal('project.check'), projectId: z.uuid(), refresh: z.boolean().default(false) })
    .strict(),
  z.object({ method: z.literal('task.detail'), taskId: z.uuid() }).strict(),
  z.object({ method: z.literal('snapshot') }).strict(),
  z.object({ method: z.literal('environment.check') }).strict(),
  z
    .object({
      method: z.literal('project.import'),
      requestId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      path: z
        .string()
        .min(1)
        .max(4096)
        .refine((v) => v.startsWith('/') && !v.includes('\0')),
    })
    .strict(),
  z
    .object({
      method: z.literal('settings.save'),
      requestId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      values: settingsSchema,
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type Project = {
  id: string;
  name: string;
  description: string;
  repositoryPath: string;
  gitCommonDir: string;
  version: number;
  createdAt: string;
};
export type VersionedSettings = { version: number; values: Settings };
export type Snapshot = {
  protocolVersion: number;
  environmentChecks: EnvironmentCheck[] | null;
  projects: Project[];
  settings: VersionedSettings;
  dataDirectory: string;
};
export type ProjectCheck = {
  checkedAt: string;
  status: 'passed' | 'warning' | 'failed' | 'unknown';
  remote: string | null;
  defaultBranch: string | null;
  githubLogin: string | null;
  repositoryPermission: string | null;
  detail: string;
};
export type EnvironmentCheck = {
  tool: 'git' | 'gh' | 'codex';
  path: string | null;
  status: 'passed' | 'warning' | 'failed' | 'unknown';
  checkedAt: string;
  detail: string;
};
export type Reply<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export class ForgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorReply(error: unknown): Reply<never> {
  if (error instanceof z.ZodError)
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
    };
  if (error instanceof ForgeError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: 'INTERNAL', message: '操作失败，请检查本地诊断信息；数据未被重置。' } };
}
export type DesktopBridge = {
  checkProject(projectId: string, refresh?: boolean): Promise<Reply<ProjectCheck | null>>;
  taskBoard(projectId: string): Promise<Reply<Board>>;
  taskDetail(taskId: string): Promise<Reply<TaskDetail>>;
  mutateTask(command: TaskCommand): Promise<Reply<Task | { id: string; version: number }>>;
  snapshot(): Promise<Reply<Snapshot>>;
  saveSettings(
    input: Omit<Extract<Command, { method: 'settings.save' }>, 'method'>,
  ): Promise<Reply<VersionedSettings>>;
  importProject(
    input: Omit<Extract<Command, { method: 'project.import' }>, 'method'>,
  ): Promise<Reply<Project>>;
  checkEnvironment(): Promise<Reply<EnvironmentCheck[]>>;
  chooseRepository(): Promise<string | null>;
  chooseExecutable(): Promise<string | null>;
};

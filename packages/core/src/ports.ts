import type { Board, TaskDetail, TaskCommand, Task } from '../../contracts/src/tasks';
import type {
  Command,
  EnvironmentCheck,
  Project,
  Settings,
  VersionedSettings,
} from '../../contracts/src/index';
export type Repository = { repositoryPath: string; gitCommonDir: string };
export interface Store {
  readDiagnostic(key: string, configKey: string): Promise<unknown>;
  saveDiagnostic(key: string, configKey: string, values: unknown): Promise<void>;
  board(projectId: string): Promise<Board>;
  detail(taskId: string): Promise<TaskDetail>;
  mutateTask(command: TaskCommand): Promise<Task | { id: string; version: number }>;
  snapshot(): Promise<{ projects: Project[]; settings: VersionedSettings }>;
  lookupProjectImport(input: { requestId: string; name: string; path: string }): Promise<Project | undefined>;
  createProject(input: {
    requestId: string;
    name: string;
    path: string;
    repository: Repository;
  }): Promise<Project>;
  saveSettings(
    input: Omit<Extract<Command, { method: 'settings.save' }>, 'method'>,
  ): Promise<VersionedSettings>;
  close(): Promise<void>;
}
export interface LocalTools {
  checkProject?(
    project: Project,
    settings: Settings,
  ): Promise<import('../../contracts/src/index').ProjectCheck>;
  inspectRepository(path: string, gitPath: string): Promise<Repository>;
  checkEnvironment(settings: Settings): Promise<EnvironmentCheck[]>;
}

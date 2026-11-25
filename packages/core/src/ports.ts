import type {
  Command,
  EnvironmentCheck,
  Project,
  Settings,
  VersionedSettings,
} from '../../contracts/src/index';
export type Repository = { repositoryPath: string; gitCommonDir: string };
export interface Store {
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
  inspectRepository(path: string, gitPath: string): Promise<Repository>;
  checkEnvironment(settings: Settings): Promise<EnvironmentCheck[]>;
}

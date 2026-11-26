import { commandSchema, PROTOCOL_VERSION, ForgeError } from '../../contracts/src/index';
import type { Store, LocalTools } from './ports';
export class CoreService {
  constructor(
    private readonly store: Store,
    private readonly tools: LocalTools,
    private readonly dataDirectory: string,
  ) {}
  async execute(input: unknown): Promise<unknown> {
    const command = commandSchema.parse(input);
    switch (command.method) {
      case 'project.check': {
        const snapshot = await this.store.snapshot();
        const project = snapshot.projects.find((p) => p.id === command.projectId);
        if (!project || !this.tools.checkProject) throw new ForgeError('NOT_FOUND', '项目不存在或诊断不可用');
        const key = `project:${project.id}`,
          configKey = `${project.version}:${snapshot.settings.version}`;
        if (!command.refresh) return this.store.readDiagnostic(key, configKey);
        const result = await this.tools.checkProject(project, snapshot.settings.values);
        await this.store.saveDiagnostic(key, configKey, result);
        return result;
      }
      case 'task.board':
        return this.store.board(command.projectId);
      case 'task.detail':
        return this.store.detail(command.taskId);
      case 'task.create':
      case 'task.update':
      case 'task.reparent':
      case 'task.action':
      case 'task.reorder':
      case 'project.update':
        return this.store.mutateTask(command);
      case 'snapshot': {
        const snapshot = await this.store.snapshot();
        return {
          ...snapshot,
          environmentChecks: await this.store.readDiagnostic(
            'environment',
            String(snapshot.settings.version),
          ),
          protocolVersion: PROTOCOL_VERSION,
          dataDirectory: this.dataDirectory,
        };
      }
      case 'settings.save':
        return this.store.saveSettings(command);
      case 'environment.check': {
        const settings = (await this.store.snapshot()).settings;
        const result = await this.tools.checkEnvironment(settings.values);
        await this.store.saveDiagnostic('environment', String(settings.version), result);
        return result;
      }
      case 'project.import': {
        const committed = await this.store.lookupProjectImport(command);
        if (committed) return committed;
        const settings = (await this.store.snapshot()).settings.values;
        const repository = await this.tools.inspectRepository(command.path, settings.gitPath);
        return this.store.createProject({ ...command, repository });
      }
    }
  }
}

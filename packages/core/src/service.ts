import { commandSchema, PROTOCOL_VERSION } from '../../contracts/src/index';
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
      case 'snapshot':
        return {
          ...(await this.store.snapshot()),
          protocolVersion: PROTOCOL_VERSION,
          dataDirectory: this.dataDirectory,
        };
      case 'settings.save':
        return this.store.saveSettings(command);
      case 'environment.check':
        return this.tools.checkEnvironment((await this.store.snapshot()).settings.values);
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

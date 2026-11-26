import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import { ForgeError, type Reply } from '../../../../packages/contracts/src/index';

export class CoreHost {
  private child?: UtilityProcess;
  private ready?: Promise<void>;
  private stopping = false;
  private restarts = 0;
  private migrationPid?: number;
  private forceStop(child: UtilityProcess) {
    if (this.migrationPid) {
      try {
        process.kill(-this.migrationPid, 'SIGKILL');
      } catch {
        /* Owned group already ended. */
      }
    }
    child.kill();
  }
  private requests = new Map<
    string,
    { resolve: (reply: Reply) => void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private readonly dataDirectory: string,
    private readonly appDirectory: string,
    private readonly entryDirectory: string,
  ) {}
  start(): Promise<void> {
    this.ready = this.boot();
    // Keep rejection observable to requests without causing an unhandled rejection.
    void this.ready.catch(() => undefined);
    return this.ready;
  }
  private async boot() {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    await new Promise<void>((resolve, reject) => {
      const migration = utilityProcess.fork(
        join(this.entryDirectory, 'migrate.cjs'),
        [this.dataDirectory, this.appDirectory, process.execPath],
        {
          serviceName: 'Forge Migration',
          stdio: 'pipe',
          env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp' },
        },
      );
      this.child = migration;
      let detail = '';
      let bytes = 0;
      let timedOut = false;
      let force: ReturnType<typeof setTimeout> | undefined;
      const log = (chunk: Buffer) => {
        if ((bytes += chunk.length) < 128 * 1024) detail += chunk.toString();
      };
      migration.stdout?.on('data', log);
      migration.stderr?.on('data', log);
      migration.on('message', (message: { type?: string; message?: string; pid?: number }) => {
        if (message.type === 'failure') detail += message.message ?? '';
        if (message.type === 'process-started') this.migrationPid = message.pid;
        if (message.type === 'process-ended') this.migrationPid = undefined;
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        migration.postMessage({ type: 'shutdown' });
        force = setTimeout(() => this.forceStop(migration), 10000);
      }, 60000);
      migration.once('exit', (code) => {
        clearTimeout(timeout);
        if (force) clearTimeout(force);
        this.migrationPid = undefined;
        void appendFile(
          join(this.dataDirectory, 'startup.log'),
          `${new Date().toISOString()} migration exit=${code}\n${detail}\n`,
          { mode: 0o600 },
        ).catch(() => undefined);
        if (code === 0 && !timedOut && !this.stopping) resolve();
        else reject(new ForgeError('MAINTENANCE', `数据库启动失败；原库已保留。${detail.slice(-1500)}`));
      });
    });
    if (this.stopping) return;
    await new Promise<void>((resolve, reject) => {
      const child = utilityProcess.fork(
        join(this.entryDirectory, 'core.cjs'),
        [this.dataDirectory, this.appDirectory],
        { serviceName: 'Forge Core', stdio: 'pipe' },
      );
      this.child = child;
      let initialized = false;
      const timeout = setTimeout(() => {
        child.kill();
        reject(new ForgeError('CORE_TIMEOUT', 'Core 启动超时'));
      }, 20000);
      child.on('message', (message: { type?: string; message?: string; id?: string; reply?: Reply }) => {
        if (message.type === 'ready') {
          initialized = true;
          clearTimeout(timeout);
          resolve();
        }
        if (message.type === 'failure') {
          clearTimeout(timeout);
          reject(new ForgeError('CORE_STARTUP', message.message ?? 'Core 启动失败'));
        }
        if (message.id && message.reply) {
          const pending = this.requests.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.requests.delete(message.id);
            pending.resolve(message.reply);
          }
        }
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        for (const pending of this.requests.values()) {
          clearTimeout(pending.timer);
          pending.resolve({
            ok: false,
            error: { code: 'CORE_INTERRUPTED', message: 'Core 已中断，请重新加载；未确认的操作可安全重试' },
          });
        }
        this.requests.clear();
        if (!initialized) reject(new ForgeError('CORE_STARTUP', 'Core 未能启动，请查看数据目录中的诊断文件'));
        if (!this.stopping && initialized) {
          if (this.restarts++ < 1) void this.start().catch(() => undefined);
          else {
            this.ready = Promise.reject(new ForgeError('CORE_UNAVAILABLE', 'Core 多次退出，请重启应用'));
            void this.ready.catch(() => undefined);
          }
        }
      });
    });
  }
  async request(command: unknown): Promise<Reply> {
    await this.ready;
    if (!this.child || this.stopping) throw new ForgeError('CORE_UNAVAILABLE', 'Core 不可用');
    return new Promise((resolve) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.requests.delete(id);
        resolve({
          ok: false,
          error: { code: 'REQUEST_TIMEOUT', message: '请求超时，结果尚未确认；请保留输入并重试' },
        });
      }, 20000);
      this.requests.set(id, { resolve, timer });
      this.child!.postMessage({ id, command });
    });
  }
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child?.pid) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => this.forceStop(child), 10000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.postMessage({ type: 'shutdown' });
    });
  }
}

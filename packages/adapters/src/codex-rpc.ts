import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
/** Diagnostic transport only. Not wired to Owner commands or automatic execution. */
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private buffer = '';
  private ended = false;
  private closed = false;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (method: string, params: unknown) => Promise<unknown>;
  constructor(executable: string, args: string[], env: NodeJS.ProcessEnv) {
    this.child = spawn(executable, args, { env, stdio: 'pipe', shell: false, detached: true });
    this.child.stderr.on('data', () => {}); // never persist auth/config diagnostics
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > 4 * 1024 * 1024)
        return this.fail(new Error('RPC frame exceeds limit'));
      let end: number;
      while ((end = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (!m || typeof m !== 'object') throw new Error('invalid frame');
          if (typeof m.method === 'string') {
            if (m.id !== undefined) {
              void (async () => {
                try {
                  const result = this.onRequest
                    ? await this.onRequest(m.method, m.params)
                    : { decision: 'decline' };
                  this.send({ id: m.id, result });
                } catch {
                  this.send({ id: m.id, error: { code: -32603, message: 'Request denied' } });
                }
              })();
            } else this.onNotification?.(m.method, m.params);
          } else {
            const p = this.pending.get(m.id);
            if (p) {
              clearTimeout(p.timer);
              this.pending.delete(m.id);
              if (m.error) p.reject(new Error(`RPC ${m.error.code}: ${m.error.message}`));
              else if ('result' in m) p.resolve(m.result);
              else {
                p.reject(new Error('Invalid RPC response'));
                this.fail(new Error('Invalid RPC response'));
              }
            }
          }
        } catch {
          this.fail(new Error('Invalid RPC frame'));
        }
      }
    });
    this.child.on('error', (e) => this.fail(e));
    this.child.on('close', () => {
      this.closed = true;
      this.fail(new Error('RPC process exited'));
    });
    this.child.stdin.on('error', (e) => this.fail(e));
  }
  private send(value: unknown) {
    if (!this.ended) this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }
  notify(method: string, params: unknown = {}) {
    this.send({ method, params });
  }
  request(method: string, params: unknown = {}, timeout = 15000): Promise<unknown> {
    if (this.ended) return Promise.reject(new Error('RPC closed'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  private fail(error: Error) {
    this.ended = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    try {
      if (this.child.pid) process.kill(-this.child.pid, 'SIGTERM');
    } catch {
      /* exited */
    }
  }
  async close() {
    const exited = new Promise<void>((resolve) => {
      if (this.closed) return resolve();
      this.child.once('close', () => resolve());
    });
    this.fail(new Error('RPC closed'));
    const timer = setTimeout(() => {
      try {
        if (this.child.pid) process.kill(-this.child.pid, 'SIGKILL');
      } catch {
        /* exited */
      }
    }, 500);
    await exited;
    clearTimeout(timer);
  }
}

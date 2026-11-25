import { spawn } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { ForgeError, type EnvironmentCheck, type Settings } from '../../contracts/src/index';

export function runCommand(
  executable: string,
  argv: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    onSpawn?: (pid: number) => void;
  } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, {
      cwd: options.cwd ?? homedir(),
      env: options.env ?? toolEnvironment(),
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid) options.onSpawn?.(child.pid);
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let failure: Error | undefined;
    let hardKill: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        /* Already exited. */
      }
    };
    const stop = (error: Error) => {
      if (failure) return;
      failure = error;
      kill('SIGTERM');
      hardKill = setTimeout(() => kill('SIGKILL'), 250);
    };
    const timeout = setTimeout(
      () => stop(new ForgeError('TOOL_TIMEOUT', '工具检测超时，请检查可执行文件路径')),
      options.timeoutMs ?? 10000,
    );
    const abort = () => stop(new ForgeError('TOOL_CANCELLED', '工具检测已取消'));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (chunk: Buffer, kind: 'out' | 'err') => {
      bytes += chunk.length;
      if (bytes > (options.maxBytes ?? 128 * 1024)) {
        stop(new ForgeError('TOOL_OUTPUT_LIMIT', '工具输出超出检测上限'));
        return;
      }
      if (kind === 'out') stdout += chunk.toString();
      else stderr += chunk.toString();
    };
    child.stdout.on('data', (chunk: Buffer) => collect(chunk, 'out'));
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, 'err'));
    child.on('error', () => {
      failure = new ForgeError('TOOL_UNAVAILABLE', '无法启动工具，请检查路径和执行权限');
    });
    child.on('close', (code) => {
      kill('SIGKILL'); // Reap descendants even if the group leader exited first.
      clearTimeout(timeout);
      if (hardKill) clearTimeout(hardKill);
      options.signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}
export async function resolveTool(name: string, configured = ''): Promise<string> {
  const candidates = configured
    ? [configured]
    : [
        ...(process.env.PATH ?? '').split(delimiter),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        join(homedir(), '.local/bin'),
        join(homedir(), '.cargo/bin'),
      ]
        .filter(Boolean)
        .map((dir) => join(dir, name));
  for (const path of candidates) {
    if (!isAbsolute(path)) continue;
    try {
      await access(path, constants.X_OK);
      return await realpath(path);
    } catch {
      /* Try the next explicit candidate. */
    }
  }
  throw new ForgeError('TOOL_UNAVAILABLE', `未找到 ${name}，请在设置中选择可执行文件`);
}
export async function checkEnvironment(settings: Settings): Promise<EnvironmentCheck[]> {
  return Promise.all(
    (['git', 'gh', 'codex'] as const).map(async (tool) => {
      let path: string | null = null;
      try {
        path = await resolveTool(tool, settings[`${tool}Path`]);
        const result = await runCommand(path, ['--version'], { timeoutMs: 5000, maxBytes: 8192 });
        return {
          tool,
          path,
          checkedAt: new Date().toISOString(),
          status: result.code === 0 ? 'passed' : 'failed',
          detail:
            result.code === 0
              ? `${result.stdout.trim().split('\n')[0]}. 仅版本检查；账号和执行能力尚未验证。`
              : `版本检查退出码 ${result.code}`,
        } satisfies EnvironmentCheck;
      } catch (error) {
        return {
          tool,
          path,
          checkedAt: new Date().toISOString(),
          status: error instanceof ForgeError && error.code === 'TOOL_TIMEOUT' ? 'unknown' : 'failed',
          detail: error instanceof ForgeError ? error.message : '工具检测失败',
        } satisfies EnvironmentCheck;
      }
    }),
  );
}

export function toolEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir() };
  for (const key of ['TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}

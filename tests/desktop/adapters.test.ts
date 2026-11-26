import { expect, it } from 'vitest';
import { mkdtemp, rm, chmod, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { runCommand, checkEnvironment } from '../../packages/adapters/src/process';
import { inspectRepository } from '../../packages/adapters/src/git';
import { startLocalServer } from '../../packages/adapters/src/local-rpc';
import { defaultSettings } from '../../packages/contracts/src/index';

it('bounds external command time/output and reports nonzero exit without a shell', async () => {
  expect(
    await runCommand(process.execPath, ['-e', 'console.log(process.argv[1])', '$(echo unsafe)'], {
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),
  ).toMatchObject({ stdout: '$(echo unsafe)\n', code: 0 });
  await expect(
    runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeoutMs: 80,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),
  ).rejects.toMatchObject({ code: 'TOOL_TIMEOUT' });
  await expect(
    runCommand(process.execPath, ['-e', 'process.stdout.write("a".repeat(20000))'], {
      maxBytes: 1024,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    }),
  ).rejects.toMatchObject({ code: 'TOOL_OUTPUT_LIMIT' });
  expect(
    await runCommand(process.execPath, ['-e', 'process.exit(7)'], { env: { ELECTRON_RUN_AS_NODE: '1' } }),
  ).toMatchObject({ code: 7 });
});
it('canonicalizes worktrees and accepts local-only repositories with spaces/non-ASCII paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge git 中文 '));
  try {
    await runCommand('/usr/bin/git', ['init', '-b', 'main', dir]);
    await runCommand('/usr/bin/git', [
      '-C',
      dir,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'initial',
    ]);
    const tree = join(dir, 'linked tree');
    await runCommand('/usr/bin/git', ['-C', dir, 'worktree', 'add', '-b', 'test', tree]);
    const primary = await inspectRepository(dir, '/usr/bin/git');
    expect((await inspectRepository(tree, '/usr/bin/git')).gitCommonDir).toBe(primary.gitCommonDir);
    expect(primary.repositoryPath).toContain('forge git 中文 ');
    await expect(inspectRepository(tmpdir(), '/usr/bin/git')).rejects.toMatchObject({
      code: 'INVALID_REPOSITORY',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('reports tool absence without blocking local work and resolves explicit executable paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-tools-'));
  try {
    const file = join(dir, 'tool');
    await writeFile(file, '#!/bin/sh\nprintf "fixture version 1\\n"\n');
    await chmod(file, 0o700);
    const checks = await checkEnvironment({
      ...defaultSettings,
      gitPath: file,
      ghPath: '/does/not/exist',
      codexPath: '/does/not/exist',
    });
    expect(checks[0]).toMatchObject({ status: 'passed', path: await realpath(file) });
    expect(checks[1].status).toBe('failed');
    expect(checks[2].status).toBe('failed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
function rpc(path: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    let data = '';
    socket.on('connect', () => socket.write(input));
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\n')) {
        socket.destroy();
        resolve(data);
      }
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(data));
  });
}
it('limits local socket to read-only versioned queries and handles malformed input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-rpc-'));
  const path = join(dir, 'core.sock');
  const server = await startLocalServer(path);
  try {
    expect(
      JSON.parse(
        await rpc(
          path,
          JSON.stringify({ jsonrpc: '2.0', id: 1, protocolVersion: 1, method: 'health' }) + '\n',
        ),
      ).result,
    ).toEqual({ protocolVersion: 1, status: 'ready' });
    expect(
      JSON.parse(
        await rpc(
          path,
          JSON.stringify({ jsonrpc: '2.0', id: 2, protocolVersion: 1, method: 'snapshot' }) + '\n',
        ),
      ).error.code,
    ).toBe(-32601);
    expect(JSON.parse(await rpc(path, '{broken\n')).error.code).toBe(-32700);
    expect(await rpc(path, 'x'.repeat(70000))).toBe('');
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('ignores ambient Git and secret variables when inspecting a chosen repository', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-env-'));
  const original = process.env.GIT_DIR;
  const secret = process.env.FORGE_TEST_SECRET;
  try {
    await runCommand('/usr/bin/git', ['init', dir]);
    process.env.GIT_DIR = '/nonexistent/foreign.git';
    process.env.FORGE_TEST_SECRET = 'must-not-leak';
    expect((await inspectRepository(dir, '/usr/bin/git')).repositoryPath).toBe(await realpath(dir));
    const result = await runCommand('/usr/bin/env', []);
    expect(result.stdout).not.toContain('must-not-leak');
    expect(result.stdout).not.toContain('GIT_DIR=');
  } finally {
    if (original === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = original;
    if (secret === undefined) delete process.env.FORGE_TEST_SECRET;
    else process.env.FORGE_TEST_SECRET = secret;
    await rm(dir, { recursive: true, force: true });
  }
});
it('uses a short private socket path even for a long multibyte data directory', async () => {
  const { socketPath } = await import('../../packages/adapters/src/socket-path.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'forge-long-'));
  const nested = join(dir, '长目录'.repeat(20));
  const { mkdir, lstat } = await import('node:fs/promises');
  await mkdir(nested);
  let path = '';
  try {
    path = await socketPath(nested, true);
    expect(Buffer.byteLength(path)).toBeLessThan(104);
    expect((await lstat(join(path, '..'))).mode & 0o077).toBe(0);
    const server = await startLocalServer(path);
    expect(
      JSON.parse(
        await rpc(
          path,
          JSON.stringify({ jsonrpc: '2.0', id: 1, protocolVersion: 1, method: 'health' }) + '\n',
        ),
      ).result.status,
    ).toBe('ready');
    await server.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
    if (path) await rm(join(path, '..'), { recursive: true, force: true });
  }
});
it('reaps an owned process group on cancellation before reporting completion', async () => {
  const controller = new AbortController();
  let group: number | undefined;
  const pending = runCommand(
    process.execPath,
    [
      '-e',
      'require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"}); setInterval(()=>{},1000)',
    ],
    {
      env: { ELECTRON_RUN_AS_NODE: '1' },
      signal: controller.signal,
      onSpawn: (pid) => {
        group = pid;
      },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'TOOL_CANCELLED' });
  let alive = true;
  for (let i = 0; i < 20 && alive; i++) {
    try {
      process.kill(-group!, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch {
      alive = false;
    }
  }
  expect(alive).toBe(false);
});

it('CLI health talks to the live Core socket and rejects project queries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-cli-'));
  const path = join(dir, 'core.sock');
  const server = await startLocalServer(path);
  try {
    const cli = new URL('../../packages/cli/src/forge.mjs', import.meta.url).pathname;
    const options = { env: { ELECTRON_RUN_AS_NODE: '1', FORGE_SOCKET_PATH: path } };
    const result = await runCommand(process.execPath, [cli, 'health'], options);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ protocolVersion: 1, status: 'ready' });
    expect((await runCommand(process.execPath, [cli, 'snapshot'], options)).code).toBe(2);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

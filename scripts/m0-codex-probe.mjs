// Run explicitly with: node --import tsx scripts/m0-codex-probe.mjs
// Diagnostic fixture only; never reads existing chats or credential contents.
import { CodexRpc } from '../packages/adapters/src/codex-rpc.ts';
import { toolEnvironment, resolveTool } from '../packages/adapters/src/process.ts';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'forge-m0-'));
const work = join(dir, 'work');
await mkdir(work);
const sentinel = join(dir, 'fake-auth.txt');
await writeFile(sentinel, 'FAKE_ONLY');
const rpc = new CodexRpc(await resolveTool('codex', ''), ['app-server'], toolEnvironment());
const report = {
  checkedAt: new Date().toISOString(),
  version: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(),
};
const step = async (name, fn) => {
  try {
    report[name] = await fn();
  } catch (e) {
    report[name] = { error: String(e.message).slice(0, 300) };
  }
  console.log(name, JSON.stringify(report[name]));
};
try {
  await rpc.request('initialize', {
    clientInfo: { name: 'forge_m0_probe', version: '0.1.0' },
    capabilities: { experimentalApi: true },
  });
  rpc.notify('initialized');
  await step('account', async () => {
    const r = await rpc.request('account/read', {});
    return { type: r.account?.type, authenticated: !!r.account };
  });
  await step('models', async () => {
    const r = await rpc.request('model/list', {});
    return { count: r.data.length, default: r.data.find((m) => m.isDefault)?.id };
  });
  await step('config', async () => {
    const r = await rpc.request('config/read', { cwd: work, includeLayers: false });
    return {
      sandbox: r.config.sandbox_mode,
      approval: r.config.approval_policy,
      extensionKeys: Object.keys(r.config).filter((k) => /mcp|hook|plugin/.test(k)),
    };
  });
  for (const mode of ['readOnly', 'workspaceWrite']) {
    const sandboxPolicy =
      mode === 'readOnly'
        ? { type: mode, networkAccess: false }
        : {
            type: mode,
            writableRoots: [work],
            networkAccess: false,
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          };
    for (const [name, command] of Object.entries({
      readOutside: ['/bin/cat', sentinel],
      writeInside: ['/usr/bin/touch', join(work, 'created')],
      network: ['/usr/bin/curl', '--max-time', '3', '-I', 'https://example.com'],
    }))
      await step(`${mode}.${name}`, async () => {
        const r = await rpc.request('command/exec', {
          command,
          cwd: work,
          sandboxPolicy,
          timeoutMs: 5000,
          outputBytesCap: 1024,
        });
        return { exitCode: r.exitCode, stdout: r.stdout?.slice(0, 100), stderr: r.stderr?.slice(0, 180) };
      });
  }
  // Only synthetic repositories and socket responses; no business code or secrets.
  const { createServer } = await import('node:http');
  const socket = join(dir, 'fake-owner.sock');
  const server = createServer((_req, res) => res.end('FAKE_SOCKET_ONLY'));
  await new Promise((resolve) => server.listen(socket, resolve));
  try {
    await step('readOnly.ownerSocket', async () => {
      const r = await rpc.request('command/exec', {
        command: ['/usr/bin/curl', '--max-time', '2', '--unix-socket', socket, 'http://localhost'],
        cwd: work,
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        timeoutMs: 3000,
        outputBytesCap: 1024,
      });
      return { exitCode: r.exitCode, reachable: r.stdout.includes('FAKE_SOCKET_ONLY') };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const actualGit = execFileSync('/usr/bin/xcrun', ['--find', 'git'], { encoding: 'utf8' }).trim();
  const repo = join(dir, 'repo'),
    tree = join(dir, 'tree');
  const git = (args) =>
    execFileSync('/usr/bin/git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'main', repo]);
  git([
    '-C',
    repo,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@invalid',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  git(['-C', repo, 'worktree', 'add', '-b', 'probe', tree]);
  await writeFile(join(tree, 'fixture.txt'), 'fixture');
  for (const commonWritable of [false, true])
    await step(`git.commonWritable.${commonWritable}`, async () => {
      const r = await rpc.request('command/exec', {
        command: [actualGit, '-C', tree, 'add', 'fixture.txt'],
        cwd: tree,
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: commonWritable ? [tree, join(repo, '.git')] : [tree],
          networkAccess: false,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: true,
        },
        timeoutMs: 3000,
        outputBytesCap: 1024,
      });
      return { exitCode: r.exitCode, stderr: r.stderr.slice(0, 160) };
    });
  await step('git.commitWithCommonDir', async () => {
    const r = await rpc.request('command/exec', {
      command: [
        actualGit,
        '-C',
        tree,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@invalid',
        'commit',
        '-m',
        'sandbox fixture',
      ],
      cwd: tree,
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [tree, join(repo, '.git')],
        networkAccess: false,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      },
      timeoutMs: 3000,
      outputBytesCap: 1024,
    });
    return { exitCode: r.exitCode, stderr: r.stderr.slice(0, 160) };
  });
  // Refuse a model turn when basic read isolation fails: model tools could access the shared auth home.
  report.modelTurn =
    'blocked: outside-workspace fake authentication sentinel was readable; no model tool session started';
  await step('thread', async () => {
    const r = await rpc.request('thread/start', {
      cwd: work,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      ephemeral: false,
    });
    const id = r.thread.id;
    const read = await rpc.request('thread/read', { threadId: id, includeTurns: false });
    const resume = await rpc.request('thread/resume', { threadId: id, excludeTurns: true });
    return { id, read: read.thread.id === id, resume: resume.thread.id === id };
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rpc.close();
  await rm(dir, { recursive: true, force: true });
}

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Issue, Project, Status } from '../../packages/shared/src/contracts';
import { createApp } from '../../apps/server/src/app';

interface Execution {
  id: string;
  issueId: string;
  status: string;
  version: number;
  executor: string;
  leaseExpiresAt: string;
  summary: string | null;
  prUrl: string | null;
}
interface Invocation {
  input?: string;
  token?: string;
  configDir?: string;
  exitCode?: number;
}
const cliPath = fileURLToPath(new URL('../../packages/cli/src/forge.mjs', import.meta.url));
const password = `Testing-${randomUUID()}`;
const email = `cli-e2e-${randomUUID()}@forge.test`;
const secrets = [password];
let app: INestApplication;
let root: string;
let configDir: string;
let server: string;
let project: Project;
let actorId: string;

async function cli<T = Record<string, unknown>>(args: string[], options: Invocation = {}): Promise<T> {
  const env = { ...process.env };
  for (const key of ['FORGE_TOKEN', 'FORGE_PROJECT', 'FORGE_SERVER', 'FORGE_CONFIG_DIR']) delete env[key];
  env.FORGE_CONFIG_DIR = options.configDir ?? configDir;
  if (options.token) env.FORGE_TOKEN = options.token;
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args, '--json'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 15000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(options.input ?? '');
    },
  );
  // Boolean assertions ensure a failure cannot echo the secret in Vitest's diff.
  for (const secret of secrets)
    expect(result.stdout.includes(secret) || result.stderr.includes(secret), 'CLI leaked a secret').toBe(
      false,
    );
  expect(result.code, result.stderr).toBe(options.exitCode ?? 0);
  const output = options.exitCode ? result.stderr : result.stdout;
  expect(options.exitCode ? result.stdout : result.stderr).toBe('');
  expect(output.endsWith('\n')).toBe(true);
  expect(output.trim().split('\n')).toHaveLength(1);
  const parsed = JSON.parse(output);
  if (options.exitCode) {
    expect(parsed).toEqual({
      error: expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
    });
  }
  return parsed as T;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-cli-e2e-'));
  configDir = join(root, 'writer');
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  server = await app.getUrl();
  const session = request.agent(app.getHttpServer());
  await session.post('/api/auth/register').send({ email, password, name: 'CLI integration' }).expect(201);
  actorId = (await session.get('/api/me').expect(200)).body.actor.id;
  project = (
    await session
      .post('/api/projects')
      .send({ name: 'CLI integration', key: `E${Date.now().toString(36).toUpperCase()}` })
      .expect(201)
  ).body;
}, 30000);

afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it('runs the local agent workflow through real CLI subprocesses and revokes its login', async () => {
  const login = await cli(
    ['login', '--server', server, '--email', email, '--project', project.key, '--password-stdin'],
    { input: password + '\n' },
  );
  expect(login.authenticated).toBe(true);
  expect(login.projects).toEqual([project.key]);
  const config = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8')) as {
    server: string;
    project: string;
    token: string;
  };
  expect(typeof config.token).toBe('string');
  expect(config.token.length > 20).toBe(true);
  secrets.push(config.token);
  expect(JSON.stringify(login).includes(config.token)).toBe(false);
  expect(config.server).toBe(server);
  expect(config.project).toBe(project.key);
  expect(JSON.stringify(config).includes(password)).toBe(false);
  expect((await stat(configDir)).mode & 0o777).toBe(0o700);
  expect((await stat(join(configDir, 'config.json'))).mode & 0o777).toBe(0o600);
  const shownConfig = await cli(['config', 'show']);
  expect(shownConfig.authenticated).toBe(true);
  expect(shownConfig.tokenSource).toBe('config');
  const identity = await cli<{ actor: { id: string }; token: { id: string } }>(['whoami']);
  expect(identity.actor.id).toBe(actorId);
  expect(identity.token.id).toBe(login.tokenId);
  const mismatch = await cli<{ error: { code: string } }>(['whoami', '--server', 'http://127.0.0.1:1'], {
    exitCode: 3,
  });
  expect(mismatch.error.code).toBe('TOKEN_SERVER_MISMATCH');
  expect(await cli<Project[]>(['project', 'list'])).toEqual([expect.objectContaining({ id: project.id })]);
  expect((await cli<Project>(['project', 'show', project.key])).id).toBe(project.id);
  const statuses = await cli<Status[]>(['status', 'list']);
  expect(statuses.length).toBeGreaterThan(0);
  expect(await cli(['issue', 'list'])).toEqual({ items: [], total: 0, nextOffset: null });

  const description = '# CLI 需求\n\n保留中文和换行。\n';
  const descriptionFile = join(root, 'description.md');
  await writeFile(descriptionFile, description);
  let issue = await cli<Issue>([
    'issue',
    'create',
    '--title',
    'CLI task',
    '--type',
    'task',
    '--description-file',
    descriptionFile,
  ]);
  expect(issue.description).toBe(description);
  expect(issue.type).toBe('TASK');
  expect((await cli<Issue>(['issue', 'show', issue.key.toLowerCase()])).id).toBe(issue.id);
  const initialVersion = issue.version;
  issue = await cli<Issue>(
    [
      'issue',
      'update',
      issue.key,
      '--if-version',
      String(issue.version),
      '--priority',
      'P0',
      '--description-file',
      '-',
    ],
    { input: description + '\n已更新。' },
  );
  expect(issue.priority).toBe('URGENT');
  expect(issue.description).toBe(description + '\n已更新。');
  await cli(['issue', 'update', issue.key, '--if-version', String(initialVersion), '--title', 'stale'], {
    exitCode: 6,
  });
  issue = await cli<Issue>(['issue', 'assign', issue.key, '--to', 'me']);
  expect(issue.assigneeId).toBe(actorId);
  const updateArgs = [
    'issue',
    'update',
    issue.key,
    '--title',
    'Idempotent title',
    '--idempotency-key',
    randomUUID(),
  ];
  const firstUpdate = await cli<Issue>(updateArgs);
  issue = await cli<Issue>(['issue', 'update', issue.key, '--title', 'Later title']);
  expect(await cli<Issue>(updateArgs)).toEqual(firstUpdate);
  expect((await cli<Issue>(['issue', 'show', issue.key])).title).toBe('Later title');
  const comment = '执行计划\n- 完成并验证\n';
  const commentFile = join(root, 'comment.md');
  await writeFile(commentFile, comment);
  expect((await cli(['issue', 'comment', issue.key, '--body-file', commentFile])).content).toBe(comment);
  const context = await cli<{ issue: Issue; comments: { content: string }[]; statuses: Status[] }>([
    'issue',
    'context',
    issue.key,
  ]);
  expect(context.issue.description).toBe(issue.description);
  expect(context.comments.some((c) => c.content === comment)).toBe(true);
  expect(context.statuses).toHaveLength(statuses.length);
  const listed = await cli<{ items: Issue[]; total: number; nextOffset: number | null }>([
    'issue',
    'list',
    '--assigned-to',
    'me',
    '--priority',
    'P0',
    '--all',
    '--limit',
    '1',
  ]);
  expect(listed.items.map((i) => i.id)).toEqual([issue.id]);
  expect(listed.nextOffset).toBeNull();

  let run = await cli<Execution>([
    'issue',
    'claim',
    issue.key,
    '--if-version',
    String(issue.version),
    '--lease-minutes',
    '5',
    '--executor',
    'codex-e2e',
  ]);
  expect(run.status).toBe('RUNNING');
  expect(run.executor).toBe('codex-e2e');
  await cli(['issue', 'claim', issue.key], { exitCode: 6 });
  const beforeRenewal = run.leaseExpiresAt;
  const renewArgs = ['run', 'renew', run.id, '--idempotency-key', randomUUID(), '--lease-minutes', '30'];
  run = await cli<Execution>(renewArgs);
  expect(await cli<Execution>(renewArgs)).toEqual(run);
  expect(new Date(run.leaseExpiresAt).getTime()).toBeGreaterThan(new Date(beforeRenewal).getTime());
  const summary = '完成 CLI 贯通验证。\n';
  const summaryFile = join(root, 'summary.md');
  await writeFile(summaryFile, summary);
  const finishArgs = [
    'run',
    'finish',
    run.id,
    '--idempotency-key',
    randomUUID(),
    '--outcome',
    'succeeded',
    '--summary-file',
    summaryFile,
    '--pr-url',
    'https://github.com/acme/repo/pull/1',
  ];
  run = await cli<Execution>(finishArgs);
  expect(await cli<Execution>(finishArgs)).toEqual(run);
  await writeFile(summaryFile, 'Changed file content');
  await cli(finishArgs, { exitCode: 6 });
  expect(run.status).toBe('SUCCEEDED');
  expect(run.summary).toBe(summary);
  expect(run.prUrl).toBe('https://github.com/acme/repo/pull/1');
  expect((await cli<Execution>(['run', 'show', run.id])).status).toBe('SUCCEEDED');
  expect(
    await cli<{ items: Execution[]; nextCursor: string | null }>(['run', 'list', '--issue', issue.key]),
  ).toEqual({
    items: [expect.objectContaining({ id: run.id })],
    nextCursor: null,
  });
  const afterFinish = await cli<Issue>(['issue', 'show', issue.key]);
  expect(afterFinish.statusId).toBe(issue.statusId);
  expect(afterFinish.assigneeId).toBe(actorId);
  expect(afterFinish.version).toBe(issue.version);
  await cli(['issue', 'claim', issue.key]);
  const releaseArgs = ['issue', 'release', issue.key, '--idempotency-key', randomUUID()];
  const released = await cli<Execution>(releaseArgs);
  expect(released.status).toBe('CANCELLED');
  const newRun = await cli<Execution>(['issue', 'claim', issue.key]);
  expect(await cli<Execution>(releaseArgs)).toEqual(released);
  expect((await cli<Execution>(['run', 'show', newRun.id])).status).toBe('RUNNING');
  await cli(['issue', 'release', issue.key]);

  const second = await cli<Issue>(['issue', 'create', '--title', 'Pagination task', '--type', 'task']);
  const firstPage = await cli<{ items: Issue[]; total: number; nextOffset: number | null }>([
    'issue',
    'list',
    '--limit',
    '1',
  ]);
  expect(firstPage.items).toHaveLength(1);
  expect(firstPage.total).toBe(2);
  expect(firstPage.nextOffset).toBe(1);
  const allPages = await cli<{ items: Issue[]; total: number; nextOffset: number | null }>([
    'issue',
    'list',
    '--limit',
    '1',
    '--all',
  ]);
  expect(allPages.items.map((i) => i.id).sort()).toEqual([issue.id, second.id].sort());
  expect(allPages.nextOffset).toBeNull();

  const readerDir = join(root, 'reader');
  await cli(
    [
      'login',
      '--server',
      server,
      '--email',
      email,
      '--project',
      project.key,
      '--password-stdin',
      '--read-only',
    ],
    { input: password + '\n', configDir: readerDir },
  );
  const readerConfig = JSON.parse(await readFile(join(readerDir, 'config.json'), 'utf8')) as {
    token: string;
  };
  secrets.push(readerConfig.token);
  expect((await cli<Issue>(['issue', 'show', issue.key], { configDir: readerDir })).id).toBe(issue.id);
  await cli(['issue', 'create', '--type', 'task', '--title', 'forbidden'], {
    configDir: readerDir,
    exitCode: 4,
  });
  await cli(['issue', 'claim', issue.key], { configDir: readerDir, exitCode: 4 });
  await cli(['logout'], { configDir: readerDir });

  await cli(['whoami'], { token: 'invalid-token', exitCode: 3 });
  await cli(['issue', 'list', '--unknown-option'], { exitCode: 2 });
  await cli(['issue', 'list', '--title', 'wrong-command-option'], { exitCode: 2 });
  expect(await cli(['logout'])).toEqual({ loggedOut: true, revoked: true });
  const loggedOutConfig = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8'));
  expect(Object.hasOwn(loggedOutConfig, 'token')).toBe(false);
  await cli(['whoami'], { exitCode: 3 });
  await cli(['whoami'], { token: config.token, exitCode: 3 });
  await request(app.getHttpServer())
    .get('/api/auth/whoami')
    .set('Authorization', `Bearer ${config.token}`)
    .expect(401);
}, 90000);

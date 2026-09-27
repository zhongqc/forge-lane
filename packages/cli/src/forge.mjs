#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { readFile } from 'node:fs/promises';
import { commands, stringOptions, booleanOptions, help } from './commands.mjs';
import {
  CliError,
  Client,
  serverUrl,
  readConfig,
  writeConfig,
  stdinText,
  textFile,
  prompt,
  integer,
  exact,
  print,
  digest,
  readOperation,
  freezeOperation,
} from './runtime.mjs';
const raw = process.argv.slice(2);
let json = raw.includes('--json');
async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: raw,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries([
        ...stringOptions.map((k) => [k, { type: 'string', ...(k === 'project' ? { multiple: true } : {}) }]),
        ...booleanOptions.map((k) => [k, { type: 'boolean' }]),
      ]),
    });
  } catch (e) {
    throw new CliError(e.message);
  }
  const f = parsed.values;
  json = !!f.json;
  let p = parsed.positionals;
  if (f.version) {
    if (p.length) throw new CliError('--version 只用于显示 CLI 版本；写入版本条件使用 --if-version');
    return { version: '0.1.0' };
  }
  const command = commands[p[0]] ? p[0] : p.slice(0, 2).join(' '),
    definition = commands[command];
  if (f.help || !p.length) {
    if (json) return { help: help(command) };
    print(help(command), false);
    return;
  }
  if (!definition) throw new CliError(`未知命令：${p.join(' ')}。运行 forge --help 查看命令。`);
  const args = p.slice(command.split(' ').length);
  if (args.length !== definition.args) throw new CliError(definition.usage);
  const allowed = new Set(['server', 'project', 'json', 'help', ...definition.options.split(' ')]);
  for (const flag of Object.keys(f))
    if (!allowed.has(flag)) throw new CliError(`${command} 不支持 --${flag}`);
  if (command !== 'login' && f.project?.length > 1) throw new CliError('此命令只能指定一个 --project');
  const config = await readConfig();
  const selectedProject = f.project?.at(-1) || process.env.FORGE_PROJECT || config.project;
  const server = f.server || process.env.FORGE_SERVER || config.server;
  if (command === 'config show')
    return {
      server,
      project: selectedProject,
      authenticated: !!(process.env.FORGE_TOKEN || config.token),
      tokenSource: process.env.FORGE_TOKEN ? 'environment' : config.token ? 'config' : null,
    };
  if (command === 'config set') {
    if (!['server', 'project'].includes(args[0])) throw new CliError('配置项仅支持 server 或 project');
    if (args[0] === 'server') {
      const next = serverUrl(args[1]);
      if (next !== config.server) {
        delete config.token;
        delete config.project;
      }
      config.server = next;
    } else config.project = args[1];
    await writeConfig(config);
    return { updated: args[0] };
  }
  if (command === 'skill print') {
    const content = await readFile(
      globalThis.__forgeEmbeddedSkillPath ?? new URL('../skills/forge-cli/SKILL.md', import.meta.url),
      'utf8',
    );
    if (json) return { content };
    print(content, false);
    return;
  }
  if (command === 'logout' && f.local) {
    delete config.token;
    await writeConfig(config);
    return { loggedOut: true, revoked: false };
  }
  if (!server) throw new CliError('请先 forge login --server URL，或设置 FORGE_SERVER');
  if (command === 'login') return login(config, server, f);
  const token = process.env.FORGE_TOKEN || config.token;
  if (!token) throw new CliError('请先 forge login，或设置 FORGE_TOKEN', 'UNAUTHENTICATED', 3);
  if (!process.env.FORGE_TOKEN && serverUrl(server) !== config.server)
    throw new CliError(
      '服务地址与本地令牌不匹配，请重新登录；不会向其他服务器发送令牌',
      'TOKEN_SERVER_MISMATCH',
      3,
    );
  const client = new Client(server, token);
  const supportsReplay = definition.options.split(' ').includes('idempotency-key');
  const signatureFlags = Object.fromEntries(
    Object.entries(f)
      .filter(([k]) => !['json', 'server', 'project', 'idempotency-key'].includes(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  if (supportsReplay)
    for (const key of ['description-file', 'body-file', 'summary-file']) {
      if (f[key] !== undefined)
        signatureFlags[key] = {
          path: f[key],
          sha256: digest(await textFile(f[key], key === 'description-file' ? 200000 : 20000)),
        };
    }
  const signature = digest(
    JSON.stringify({ command, args, project: selectedProject ?? null, flags: signatureFlags }),
  );
  if (supportsReplay && f['idempotency-key']) {
    const existing = await readOperation(client.server, token, f['idempotency-key'], signature);
    if (existing) return client.request(existing.path, existing.method, existing.body, f['idempotency-key']);
  }
  const api = async (path, method, body) => {
    if (!method || method === 'GET') return client.request(path, method, body);
    const key = f['idempotency-key'] || randomUUID();
    if (supportsReplay) {
      const frozen = await freezeOperation(client.server, token, key, signature, { path, method, body });
      return client.request(frozen.path, frozen.method, frozen.body, key);
    }
    return client.request(path, method, body, key);
  };
  let projectsCache, boardCache;
  const projects = async () => (projectsCache ??= await api('/projects'));
  const project = async (ref = selectedProject) => {
    if (!ref) throw new CliError('请通过 --project APP 指定项目，或 forge config set project APP');
    return exact(await projects(), ref, ['id', 'key']);
  };
  const board = async (projectId) =>
    boardCache?.project.id === projectId
      ? boardCache
      : (boardCache = await api(`/projects/${projectId}/board`));
  const issue = (ref) =>
    api(
      /^[0-9a-f-]{36}$/i.test(ref)
        ? `/issues/${ref}`
        : `/issues/by-key/${encodeURIComponent(ref.toUpperCase())}`,
    );
  const required = (key) => {
    if (f[key] === undefined) throw new CliError(`需要 --${key}`);
    return f[key];
  };
  const me = () => api('/auth/whoami');
  const userId = async (value, b) =>
    value === 'none' ? null : value === 'me' ? (await me()).actor.id : exact(b.members, value).id;
  async function fields(b) {
    const body = {};
    if (f.title !== undefined) body.title = f.title;
    if (f.type !== undefined) {
      const type = f.type.toUpperCase();
      if (!['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'].includes(type))
        throw new CliError('type 应为 epic/story/task/bug/subtask');
      body.type = type;
    }
    if (f['description-file'] !== undefined) body.description = await textFile(f['description-file']);
    if (f.priority !== undefined) {
      const priorities = {
        P0: 'URGENT',
        P1: 'HIGH',
        P2: 'MEDIUM',
        P3: 'LOW',
        NONE: 'NONE',
        URGENT: 'URGENT',
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW',
      };
      body.priority = priorities[f.priority.toUpperCase()];
      if (!body.priority) throw new CliError('priority 应为 P0/P1/P2/P3/none');
    }
    if (f.status !== undefined) body.statusId = exact(b.statuses, f.status).id;
    if (f.assignee !== undefined) body.assigneeId = await userId(f.assignee, b);
    for (const k of ['epic', 'parent'])
      if (f[k] !== undefined) {
        if (f[k] === 'none') body[k + 'Id'] = null;
        else {
          const other = await issue(f[k]);
          if (other.projectId !== b.project.id) throw new CliError(`${k} 必须属于当前项目`);
          body[k + 'Id'] = other.id;
        }
      }
    if (f.sprint !== undefined) body.sprintId = f.sprint === 'none' ? null : exact(b.sprints, f.sprint).id;
    if (f.estimate !== undefined) {
      body.estimate = f.estimate === 'none' ? null : Number(f.estimate);
      if (
        body.estimate !== null &&
        (!Number.isFinite(body.estimate) || body.estimate < 0 || body.estimate > 100000)
      )
        throw new CliError('estimate 应为非负数字或 none');
    }
    if (f.labels !== undefined)
      body.labelIds = f.labels === 'none' ? [] : f.labels.split(',').map((v) => exact(b.labels, v.trim()).id);
    return body;
  }
  if (command === 'whoami') return me();
  if (command === 'logout') {
    const current = await me();
    if (!current.token?.id) throw new CliError('服务未返回当前令牌ID', 'INVALID_RESPONSE', 7);
    await api(`/auth/tokens/${current.token.id}`, 'DELETE');
    if (config.token === token) {
      delete config.token;
      await writeConfig(config);
    }
    return { loggedOut: true, revoked: true };
  }
  if (command === 'token list') return api('/auth/tokens');
  if (command === 'token revoke') return api(`/auth/tokens/${encodeURIComponent(args[0])}`, 'DELETE');
  if (command === 'project list') return projects();
  if (command === 'project show') return project(args[0]);
  if (['status list', 'member list', 'label list', 'sprint list'].includes(command)) {
    const b = await board((await project()).id);
    return b[
      { status: 'statuses', member: 'members', label: 'labels', sprint: 'sprints' }[command.split(' ')[0]]
    ];
  }
  if (command === 'issue list') {
    const pr = await project(),
      b = await board(pr.id),
      q = new URLSearchParams();
    if (f.status) q.set('statusId', exact(b.statuses, f.status).id);
    if (f['assigned-to']) q.set('assigneeId', (await userId(f['assigned-to'], b)) ?? 'none');
    if (f.type) {
      f.type = f.type.toUpperCase();
      if (!['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'].includes(f.type)) throw new CliError('无效事项类型');
      q.set('type', f.type);
    }
    if (f.priority) {
      const x = await fields(b);
      q.set('priority', x.priority);
    }
    if (f.sprint) q.set('sprintId', f.sprint === 'none' ? 'none' : exact(b.sprints, f.sprint).id);
    if (f.epic) {
      const e = f.epic === 'none' ? null : await issue(f.epic);
      if (e && e.projectId !== pr.id) throw new CliError('Epic 必须属于当前项目');
      q.set('epicId', e?.id ?? 'none');
    }
    if (f.search) q.set('search', f.search);
    const limit = integer(f.limit, 100, 1, 500);
    let offset = integer(f.offset, 0, 0),
      total = 0;
    const items = [];
    do {
      q.set('limit', String(limit));
      q.set('offset', String(offset));
      const page = await api(`/projects/${pr.id}/issues?${q}`);
      items.push(...page.items);
      total = page.total;
      offset += page.items.length;
      if (!page.items.length) break;
    } while (f.all && offset < total);
    return { items, total, nextOffset: offset < total ? offset : null };
  }
  if (command === 'issue create') {
    const b = await board((await project()).id);
    const data = await fields(b);
    if (!data.title || !data.type) throw new CliError('创建需要 --title 和 --type');
    return api(`/projects/${b.project.id}/issues`, 'POST', data);
  }
  if (command.startsWith('issue ')) {
    const i = await issue(args[0]),
      path = `/issues/${i.id}`;
    if (command === 'issue show') return i;
    if (command === 'issue context') {
      const [b, comments, history, development, executions, parent, epic, repositories] = await Promise.all([
        board(i.projectId),
        api(path + '/comments'),
        api(path + '/activities'),
        api(path + '/development'),
        api(path + '/executions'),
        i.parentId ? issue(i.parentId) : null,
        i.effectiveEpicId ? issue(i.effectiveEpicId) : null,
        api(`/projects/${i.projectId}/repositories`),
      ]);
      return {
        issue: i,
        parent,
        epic,
        statuses: b.statuses,
        comments,
        history,
        development,
        executions,
        repositories,
        limits: { comments: 200, history: 50, developmentEach: 100 },
        instructions:
          'Use issue.version with --if-version when claiming or updating. Claim lease before development; renew periodically; finish run with result. Run completion does not change Issue status.',
      };
    }
    if (command === 'issue comments') return api(path + '/comments');
    if (command === 'issue comment')
      return api(path + '/comments', 'POST', { content: await textFile(required('body-file'), 20000) });
    if (command === 'issue development') return api(path + '/development');
    if (command === 'issue revisions')
      return api(path + '/revisions' + (f.revision ? '/' + encodeURIComponent(f.revision) : ''));
    if (command === 'issue history') {
      let cursor = f.cursor,
        items = [];
      do {
        const page = await api(
          path + '/activities' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (f.all && cursor);
      return { items, nextCursor: cursor ?? null };
    }
    if (command === 'issue claim')
      return api(path + '/claim', 'POST', {
        version: integer(f['if-version'], i.version),
        leaseMinutes: integer(f['lease-minutes'], 30, 5, 120),
        executor: f.executor || 'codex',
      });
    if (command === 'issue release') {
      const identity = await me(),
        runs = await api(path + '/executions');
      const active = runs.filter(
        (r) =>
          r.status === 'RUNNING' &&
          r.tokenId === identity.token?.id &&
          new Date(r.leaseExpiresAt) > new Date(),
      );
      if (active.length !== 1) throw new CliError('没有本令牌持有的活动租约', 'NOT_FOUND', 5);
      return api(`/executions/${active[0].id}/finish`, 'POST', {
        version: active[0].version,
        outcome: 'CANCELLED',
        summary: f['summary-file'] ? await textFile(f['summary-file'], 20000) : '主动释放任务',
      });
    }
    const b = await board(i.projectId);
    let body;
    if (command === 'issue update') {
      body = await fields(b);
      if (!Object.keys(body).length) throw new CliError('请至少指定一个要修改的字段');
    }
    if (command === 'issue transition') body = { statusId: exact(b.statuses, required('to')).id };
    if (command === 'issue assign') body = { assigneeId: await userId(required('to'), b) };
    if (body) return api(path, 'PATCH', { ...body, version: integer(f['if-version'], i.version) });
  }
  if (command === 'run list') {
    const q = new URLSearchParams();
    if (selectedProject) q.set('projectId', (await project()).id);
    if (f.issue) q.set('issueId', (await issue(f.issue)).id);
    q.set('page', 'true');
    q.set('limit', String(integer(f.limit, 50, 1, 100)));
    if (f.status) {
      const status = f.status.toUpperCase();
      if (!['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status))
        throw new CliError('无效执行状态');
      q.set('status', status);
    }
    let cursor = f.cursor;
    const items = [];
    do {
      if (cursor) q.set('cursor', cursor);
      const page = await api('/executions?' + q);
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (f.all && cursor);
    return { items, nextCursor: cursor ?? null };
  }
  if (command.startsWith('run ')) {
    const path = '/executions/' + encodeURIComponent(args[0]),
      run = await api(path);
    if (command === 'run show') return run;
    const version = integer(f['if-version'], run.version);
    if (command === 'run renew')
      return api(path + '/renew', 'POST', { version, leaseMinutes: integer(f['lease-minutes'], 30, 5, 120) });
    const outcome = required('outcome').toUpperCase();
    if (!['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(outcome))
      throw new CliError('outcome 应为 succeeded/failed/cancelled');
    return api(path + '/finish', 'POST', {
      version,
      outcome,
      summary: await textFile(required('summary-file'), 20000),
      ...(f['pr-url'] ? { prUrl: f['pr-url'] } : {}),
    });
  }
  throw new CliError('命令未实现');
}
async function login(config, server, f) {
  server = serverUrl(server);
  const client = new Client(server);
  if (f['token-stdin']) {
    if (f['password-stdin'] || f.email) throw new CliError('--token-stdin 不能与密码登录选项同时使用');
    const token = (await stdinText()).trim();
    if (!token) throw new CliError('令牌不能为空');
    client.token = token;
    const current = await client.request('/auth/whoami');
    await writeConfig({ server, token, project: f.project?.[0] || current.token?.projectIds?.[0] });
    return { authenticated: true, actor: current.actor, workspace: current.workspace, token: current.token };
  }
  const email = f.email || (await prompt('邮箱：')),
    password = f['password-stdin'] ? (await stdinText()).replace(/\r?\n$/, '') : await prompt('密码：', true);
  await client.request('/auth/login', 'POST', { email, password });
  try {
    if (f.workspace) await client.request('/workspaces/select', 'POST', { workspaceId: f.workspace });
    const available = await client.request('/projects'),
      refs =
        f.project ||
        (process.env.FORGE_PROJECT ? [process.env.FORGE_PROJECT] : config.project ? [config.project] : []);
    if (!refs.length)
      throw new CliError('登录需要 --project KEY；可用项目：' + available.map((p) => p.key).join(', '));
    const selected = refs.map((ref) => exact(available, ref, ['id', 'key']));
    const created = await client.request('/auth/tokens', 'POST', {
      name: f.name || `forge@${hostname()}`,
      projectIds: [...new Set(selected.map((p) => p.id))],
      scopes: f['read-only'] ? ['read'] : ['read', 'write'],
      expiresInDays: integer(f['expires-in-days'], 30, 1, 90),
    });
    await writeConfig({ server, token: created.token, project: selected[0].key });
    return {
      authenticated: true,
      tokenId: created.id,
      expiresAt: created.expiresAt,
      projects: selected.map((p) => p.key),
    };
  } finally {
    await client.request('/auth/logout', 'POST').catch(() => {});
  }
}
try {
  const result = await main();
  if (result !== undefined) print(result, json);
} catch (error) {
  const e =
    error instanceof CliError ? error : new CliError('CLI 执行失败，请检查配置或文件权限', 'CLI_ERROR', 7);
  process.stderr.write(
    JSON.stringify({
      error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
    }) + '\n',
  );
  process.exitCode = e.exitCode;
}

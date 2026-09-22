import { readFile, mkdir, writeFile, rename, chmod, lstat, link, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
export class CliError extends Error {
  constructor(message, code = 'INVALID_ARGUMENT', exitCode = 2, details) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}
export function serverUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError('请提供完整服务地址，例如 http://localhost:3004');
  }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol))
    throw new CliError('服务地址不能包含凭据、查询或片段');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new CliError('远程服务必须使用 HTTPS');
  if (url.pathname !== '/') throw new CliError('请填写站点根地址，不要包含 /api 或页面路径');
  return url.origin;
}
const directory = () => process.env.FORGE_CONFIG_DIR || join(homedir(), '.config', 'forge');
export async function readConfig() {
  try {
    return JSON.parse(await readFile(join(directory(), 'config.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new CliError('配置文件无法读取或格式无效', 'CONFIG_ERROR', 2);
  }
}
export async function writeConfig(value) {
  const dir = directory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) throw new CliError('配置目录不能是符号链接');
  await chmod(dir, 0o700);
  const tmp = join(dir, `.config-${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(tmp, join(dir, 'config.json'));
}
let stdinRead = false;
export async function stdinText() {
  if (stdinRead) throw new CliError('一次命令只能读取一次标准输入');
  stdinRead = true;
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text) > 250000) throw new CliError('标准输入超过250KB');
  }
  return text;
}
const textCache = new Map();
export async function textFile(path, max = 200000) {
  if (textCache.has(path)) {
    const value = textCache.get(path);
    if (value.length > max) throw new CliError(`文本超过${max}字符`);
    return value;
  }
  if (!path) throw new CliError('需要指定文本文件参数');
  let value;
  try {
    value = path === '-' ? await stdinText() : await readFile(path, 'utf8');
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(`无法读取文件：${path}`, 'FILE_ERROR', 2);
  }
  if (value.length > max) throw new CliError(`文本超过${max}字符`);
  textCache.set(path, value);
  return value;
}
export async function prompt(label, secret = false) {
  if (!process.stdin.isTTY || !process.stderr.isTTY)
    throw new CliError('非交互环境请使用 --password-stdin 或 --token-stdin');
  if (!secret) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await rl.question(label);
    } finally {
      rl.close();
    }
  }
  process.stderr.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
    };
    const receive = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup();
          reject(new CliError('已取消', 'CANCELLED', 2));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', receive);
  });
}
export class Client {
  constructor(server, token) {
    this.server = serverUrl(server);
    this.token = token;
    this.cookies = new Map();
  }
  async request(path, method = 'GET', body, key) {
    let res;
    try {
      res = await fetch(this.server + '/api' + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept: 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CliError(
        '无法连接服务或请求超时；写入结果可能不确定，请使用原幂等键重试',
        'NETWORK_ERROR',
        7,
        { idempotencyKey: key },
      );
    }
    for (const cookie of res.headers.getSetCookie()) {
      const pair = cookie.split(';')[0],
        i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new CliError('服务返回了非 JSON 响应', 'INVALID_RESPONSE', 7);
    }
    if (!res.ok) {
      const codes = { 400: 2, 401: 3, 403: 4, 404: 5, 409: 6, 422: 2 };
      throw new CliError(
        Array.isArray(data.message) ? data.message.join('；') : data.message || `HTTP ${res.status}`,
        data.code || 'API_ERROR',
        codes[res.status] || 7,
        { status: res.status, idempotencyKey: key },
      );
    }
    return data;
  }
}
export const integer = (value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new CliError(`整数应在${min}–${max}之间`);
  return n;
};
export function exact(items, value, fields = ['id', 'name']) {
  const matches = items.filter((i) => fields.some((f) => i[f] === value));
  if (matches.length !== 1)
    throw new CliError(
      matches.length ? '名称不唯一，请使用ID' : `未找到：${value}`,
      matches.length ? 'AMBIGUOUS' : 'NOT_FOUND',
      matches.length ? 2 : 5,
    );
  return matches[0];
}
export function print(value, json) {
  if (json) {
    process.stdout.write(JSON.stringify(value) + '\n');
    return;
  }
  // Control sequences from issue text must not execute in the user's terminal.
  // eslint-disable-next-line no-control-regex
  const safe = (t) => String(t ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
  if (typeof value === 'string') process.stdout.write(safe(value) + '\n');
  else process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const operationPath = (server, token, key) =>
  join(directory(), 'requests', digest(server + '\n' + digest(token) + '\n' + key) + '.json');
export async function readOperation(server, token, key, signature) {
  let value;
  try {
    value = JSON.parse(await readFile(operationPath(server, token, key), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new CliError('无法读取幂等请求缓存', 'CONFIG_ERROR', 2);
  }
  if (value.signature !== signature)
    throw new CliError('此幂等键已用于其他命令或内容', 'IDEMPOTENCY_CONFLICT', 6);
  return value;
}
export async function freezeOperation(server, token, key, signature, request) {
  const dir = join(directory(), 'requests');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) throw new CliError('请求缓存目录不能是符号链接');
  await chmod(dir, 0o700);
  const target = operationPath(server, token, key),
    tmp = target + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify({ signature, ...request }), { mode: 0o600, flag: 'wx' });
  try {
    await link(tmp, target);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  } finally {
    await unlink(tmp);
  }
  return readOperation(server, token, key, signature);
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { serverUrl, Client, exact, integer } from '../src/runtime.mjs';

await test('server URL normalization permits local HTTP and requires remote HTTPS', () => {
  assert.equal(serverUrl('http://localhost:3001/'), 'http://localhost:3001');
  assert.equal(serverUrl('http://127.0.0.1:3001'), 'http://127.0.0.1:3001');
  assert.equal(serverUrl('http://[::1]:3001'), 'http://[::1]:3001');
  assert.equal(serverUrl('https://forge.example/'), 'https://forge.example');
  assert.equal(serverUrl('https://forge.example/forge/'), 'https://forge.example/forge');
  for (const url of [
    'http://forge.example',
    'https://user:password@forge.example',
    'https://forge.example/api',
    'https://forge.example/forge/api',
    'https://forge.example?token=secret',
    'https://forge.example/#fragment',
    'file:///tmp/file',
    'invalid',
  ])
    assert.throws(() => serverUrl(url));
});

await test('client sends API requests beneath a deployed site path', async () => {
  const paths = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    paths.push(url);
    return new Response(JSON.stringify({ actor: { id: 'demo' } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const client = new Client('https://forge.example/forge/');
    assert.deepEqual(await client.request('/auth/whoami'), { actor: { id: 'demo' } });
    assert.deepEqual(paths, ['https://forge.example/forge/api/auth/whoami']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('reference matching requires one exact match and integer arguments are bounded', () => {
  const items = [
    { id: 'one', name: 'Task' },
    { id: 'two', name: 'Task' },
  ];
  assert.equal(exact(items, 'one'), items[0]);
  assert.throws(() => exact(items, 'Task'), { code: 'AMBIGUOUS', exitCode: 2 });
  assert.throws(() => exact(items, 'task'), { code: 'NOT_FOUND', exitCode: 5 });
  assert.equal(integer(undefined, 30, 5, 120), 30);
  for (const value of ['0', '121', '1.5', 'NaN']) assert.throws(() => integer(value, 30, 5, 120));
});

await test('help and invalid options are structured; configuration excludes secrets and rejects malformed data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-cli-unit-'));
  const env = { ...process.env, FORGE_CONFIG_DIR: dir };
  for (const key of ['FORGE_TOKEN', 'FORGE_PROJECT', 'FORGE_SERVER']) delete env[key];
  const invoke = (...args) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../src/forge.mjs', import.meta.url)), ...args, '--json'],
      { env, encoding: 'utf8', timeout: 5000 },
    );
  try {
    const help = invoke('--help');
    assert.equal(help.status, 0);
    assert.equal(help.stderr, '');
    assert.ok(JSON.parse(help.stdout));
    for (const args of [['unknown'], ['issue', 'list', '--unknown'], ['issue', 'list', '--title', 'x']]) {
      const invalid = invoke(...args);
      assert.equal(invalid.status, 2);
      assert.equal(invalid.stdout, '');
      assert.equal(JSON.parse(invalid.stderr).error.code, 'INVALID_ARGUMENT');
    }
    assert.equal(invoke('config', 'set', 'server', 'https://forge.example').status, 0);
    assert.equal((await stat(join(dir, 'config.json'))).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')), {
      server: 'https://forge.example',
    });
    const show = invoke('config', 'show');
    assert.equal(JSON.parse(show.stdout).authenticated, false);
    await writeFile(join(dir, 'config.json'), '{malformed');
    const malformed = invoke('config', 'show');
    assert.equal(malformed.status, 2);
    assert.equal(JSON.parse(malformed.stderr).error.code, 'CONFIG_ERROR');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

await test('skill print emits the forge CLI skill without requiring login', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-cli-skill-'));
  try {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../src/forge.mjs', import.meta.url)), 'skill', 'print'],
      { env: { ...process.env, FORGE_CONFIG_DIR: dir }, encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      (await readFile(new URL('../skills/forge-cli/SKILL.md', import.meta.url), 'utf8')).trim(),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

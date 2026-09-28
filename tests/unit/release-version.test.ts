import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve('scripts/release-version.mjs');
const paths = ['apps/web/package.json', 'apps/server/package.json', 'packages/cli/package.json'];

function fixture(versions: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'forge-release-version-'));
  for (const [index, path] of paths.entries()) {
    const file = join(root, path);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify({ name: `pkg-${index}`, version: versions[index], private: true }, null, 2)}\n`,
    );
  }
  return root;
}

void test('bump changes all three product versions and preserves other fields', () => {
  const root = fixture(['0.1.3', '0.1.3', '0.1.3']);
  try {
    execFileSync(process.execPath, [script, 'bump', '0.2.0'], { cwd: root });
    for (const path of paths) {
      const pkg = JSON.parse(readFileSync(join(root, path), 'utf8'));
      assert.equal(pkg.version, '0.2.0');
      assert.equal(pkg.private, true);
    }
    assert.equal(
      execFileSync(process.execPath, [script, 'current'], { cwd: root, encoding: 'utf8' }),
      '0.2.0\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('bump rejects invalid or non-increasing versions without changing files', () => {
  const root = fixture(['0.1.3', '0.1.3', '0.1.3']);
  try {
    for (const version of ['0.1.3', '0.1.2', 'v0.2.0', '0.2.0-beta.1', '01.2.0']) {
      const result = spawnSync(process.execPath, [script, 'bump', version], { cwd: root });
      assert.notEqual(result.status, 0, version);
      assert.match(result.stderr.toString(), /Invalid target version|must be newer/, version);
    }
    for (const path of paths) {
      assert.equal(JSON.parse(readFileSync(join(root, path), 'utf8')).version, '0.1.3');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('current rejects package version drift', () => {
  const root = fixture(['0.1.3', '0.1.3', '0.1.2']);
  try {
    const result = spawnSync(process.execPath, [script, 'current'], { cwd: root });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr.toString(), /versions do not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

void test('compiled CLI runs without Node and includes the CLI skill', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-cli-binary-'));
  try {
    const binary = join(directory, 'forge');
    const compile = spawnSync(
      'bun',
      [
        'build',
        '--compile',
        '--no-compile-autoload-dotenv',
        '--no-compile-autoload-bunfig',
        'packages/cli/src/binary.mjs',
        '--outfile',
        binary,
      ],
      {
        cwd: resolve('../..'),
        encoding: 'utf8',
      },
    );
    assert.equal(compile.status, 0, compile.stderr);
    const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /"version": "0\.1\.0"/);
    const skill = spawnSync(binary, ['skill', 'print'], { encoding: 'utf8' });
    assert.equal(skill.status, 0, skill.stderr);
    assert.equal(skill.stdout.trim(), readFileSync('skills/forge-cli/SKILL.md', 'utf8').trim());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test('release build writes a downloadable binary and matching checksum manifest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge-cli-release-'));
  const target = `bun-${process.platform === 'darwin' ? 'darwin' : process.platform}-${process.arch}`;
  try {
    const build = spawnSync(
      'node',
      ['scripts/build-cli.mjs', '--target', target, '--output-dir', directory],
      { cwd: resolve('../..'), encoding: 'utf8' },
    );
    assert.equal(build.status, 0, build.stderr);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, '0.1.0');
    assert.equal(manifest.files.length, 1);
    const file = manifest.files[0];
    assert.match(file.name, /\.zip$/);
    const entries = spawnSync('unzip', ['-Z', '-1', join(directory, file.name)], { encoding: 'utf8' });
    assert.equal(entries.status, 0, entries.stderr);
    assert.equal(entries.stdout.trim(), file.executable);
    const digest = createHash('sha256')
      .update(readFileSync(join(directory, file.name)))
      .digest('hex');
    assert.equal(file.sha256, digest);
    assert.match(readFileSync(join(directory, 'SHA256SUMS'), 'utf8'), new RegExp(digest));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

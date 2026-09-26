import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const targets = [
  { target: 'bun-darwin-arm64', label: 'macOS · Apple Silicon', name: 'forge-macos-arm64' },
  { target: 'bun-darwin-x64', label: 'macOS · Intel', name: 'forge-macos-x64' },
  { target: 'bun-linux-x64', label: 'Linux · x64', name: 'forge-linux-x64' },
  { target: 'bun-linux-arm64', label: 'Linux · ARM64', name: 'forge-linux-arm64' },
  { target: 'bun-windows-x64', label: 'Windows · x64', name: 'forge-windows-x64.exe' },
];

const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    'output-dir': { type: 'string' },
  },
});
const selected = values.target ? targets.filter((item) => item.target === values.target) : targets;
if (!selected.length) throw new Error(`Unsupported CLI target: ${values.target}`);

const root = resolve(import.meta.dirname, '..');
const output = resolve(values['output-dir'] ?? join(root, 'apps/web/public/downloads'));
const { version } = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'));
await mkdir(output, { recursive: true });
for (const item of targets) {
  await unlink(join(output, item.name)).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await unlink(join(output, item.name.replace(/\.exe$/, '') + '.zip')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

const files = [];
for (const item of selected) {
  const path = join(output, item.name);
  const result = spawnSync(
    'bun',
    [
      'build',
      '--compile',
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      `--target=${item.target}`,
      'packages/cli/src/binary.mjs',
      '--outfile',
      path,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`Failed to build ${item.target}: ${result.stderr}`);
  const archiveName = item.name.replace(/\.exe$/, '') + '.zip';
  const archivePath = join(output, archiveName);
  const zip = spawnSync('zip', ['-q', '-9', '-j', archivePath, path], { encoding: 'utf8' });
  if (zip.status !== 0) throw new Error(`Failed to archive ${item.target}: ${zip.stderr}`);
  await unlink(path);
  const archive = await readFile(archivePath);
  files.push({
    target: item.target,
    label: item.label,
    name: archiveName,
    executable: item.name,
    size: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
  });
  process.stdout.write(`Built ${archiveName}\n`);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version, files }, null, 2) + '\n');
await writeFile(
  join(output, 'SHA256SUMS'),
  files.map((file) => `${file.sha256}  ${file.name}`).join('\n') + '\n',
);

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Unit/integration tests share the actual desktop Node ABI. No alternating native rebuilds.
const child = spawn(
  require('electron'),
  [require.resolve('vitest/vitest.mjs'), 'run', ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

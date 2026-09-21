import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('docker', ['compose', 'up', '-d', 'postgres']);
let ready = false;
for (let n = 0; n < 30; n++) {
  if (
    spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'forge', '-d', 'forge'], {
      stdio: 'ignore',
    }).status === 0
  ) {
    ready = true;
    break;
  }
  await setTimeout(1000);
}
if (!ready) throw new Error('PostgreSQL 未就绪，请检查 Docker');
run('pnpm', ['exec', 'prisma', 'generate']);
run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
const children = [
  spawn('pnpm', ['--filter', '@forge/web', 'dev'], { stdio: 'inherit' }),
  spawn('pnpm', ['dev:server'], { stdio: 'inherit' }),
];
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    children.forEach((c) => c.kill(signal));
    process.exit(0);
  });
for (const child of children)
  child.on('exit', (code) => {
    children.filter((c) => c !== child).forEach((c) => c.kill('SIGTERM'));
    process.exit(code ?? 0);
  });

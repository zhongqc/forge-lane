import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const run = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const service = `dev.forge.m0.${randomUUID()}`,
  secret = randomUUID();
try {
  run('/usr/bin/security', ['add-generic-password', '-a', 'fixture', '-s', service, '-w', secret]);
  console.log(
    'keychain read match:',
    run('/usr/bin/security', ['find-generic-password', '-a', 'fixture', '-s', service, '-w']) === secret,
  );
} finally {
  run('/usr/bin/security', ['delete-generic-password', '-a', 'fixture', '-s', service]);
}
try {
  run('/usr/bin/security', ['find-generic-password', '-a', 'fixture', '-s', service, '-w']);
  throw new Error('fixture not deleted');
} catch (e) {
  if (e.status !== 44) throw e;
  console.log('keychain missing: exit 44');
}
for (const [name, args] of [
  ['identity', ['api', 'user', '--jq', '.login']],
  ['repository', ['api', 'repos/zhongqc/forge-lane', '--jq', '{default_branch,permissions}']],
  [
    'checks',
    [
      'api',
      'repos/zhongqc/forge-lane/commits/fc8e4c4/check-runs',
      '--jq',
      '{total_count,checks:[.check_runs[]|{name,status,conclusion,head_sha}]}',
    ],
  ],
  [
    'protection',
    ['api', 'repos/zhongqc/forge-lane/branches/main/protection', '--jq', '{required_status_checks}'],
  ],
]) {
  try {
    console.log(name, run('gh', args));
  } catch (e) {
    console.log(name, 'unavailable', e.status, String(e.stderr).slice(0, 200));
  }
}
console.log('remote', run('git', ['remote', 'get-url', 'origin']));
console.log('credential helper configured:', !!run('git', ['config', '--get-all', 'credential.helper']));

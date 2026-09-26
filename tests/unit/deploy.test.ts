import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('deploy/remote-deploy.sh');

function runDeploy(failNewImage: boolean, requireSudo = false, failPull = false, failPublicHealth = false) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-deploy-'));
  const bin = join(dir, 'bin');
  const log = join(dir, 'docker.log');
  mkdirSync(bin);
  writeFileSync(join(dir, '.env'), 'POSTGRES_PASSWORD=test\nAPP_URL=https://example.test/forge\n');
  writeFileSync(join(dir, 'compose.prod.yaml'), 'services: {}\n');
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
if [ "$MOCK_REQUIRE_SUDO" = 1 ] && [ "$MOCK_VIA_SUDO" != 1 ]; then exit 1; fi
printf '%s %s %s\\n' "$IMAGE_REPOSITORY" "$IMAGE_TAG" "$*" >> "$MOCK_DOCKER_LOG"
case "$*" in
  'pull registry.example.test/team/forge-lane:new')
    if [ "$MOCK_PULL_FAIL" = 1 ]; then exit 1; fi ;;
  'compose -f compose.prod.yaml ps -q app') printf 'old-container\\n' ;;
  'inspect --format {{.Image}} old-container') printf 'sha256:old-image\\n' ;;
  'compose -f compose.prod.yaml up -d --wait --wait-timeout 180')
    if [ "$MOCK_FAIL_NEW" = 1 ] && [ "$IMAGE_TAG" = new ]; then exit 1; fi ;;
esac
`,
  );
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(
    join(bin, 'sudo'),
    '#!/bin/sh\n[ "$1" = -n ] || exit 2\nshift\nunset IMAGE_TAG IMAGE_REPOSITORY\nMOCK_VIA_SUDO=1 exec "$@"\n',
  );
  chmodSync(join(bin, 'sudo'), 0o755);
  writeFileSync(
    join(bin, 'curl'),
    '#!/bin/sh\nprintf "curl %s\\n" "$*" >> "$MOCK_DOCKER_LOG"\n[ "$MOCK_PUBLIC_HEALTH_FAIL" != 1 ]\n',
  );
  chmodSync(join(bin, 'curl'), 0o755);
  const result = spawnSync('sh', [script], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      IMAGE_TAG: 'new',
      IMAGE_REPOSITORY: 'registry.example.test/team/forge-lane',
      PUBLIC_HEALTH_URL: 'https://example.test/forge/api/health',
      MOCK_FAIL_NEW: failNewImage ? '1' : '0',
      MOCK_PULL_FAIL: failPull ? '1' : '0',
      MOCK_PUBLIC_HEALTH_FAIL: failPublicHealth ? '1' : '0',
      MOCK_REQUIRE_SUDO: requireSudo ? '1' : '0',
      MOCK_DOCKER_LOG: log,
    },
    encoding: 'utf8',
  });
  const commands = existsSync(log) ? readFileSync(log, 'utf8') : '';
  rmSync(dir, { recursive: true, force: true });
  return { result, commands };
}

void test('deploys the release image and waits for health', () => {
  const { result, commands } = runDeploy(false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(commands, /pull registry\.example\.test\/team\/forge-lane:new/);
  assert.match(
    commands,
    /registry\.example\.test\/team\/forge-lane new compose -f compose\.prod\.yaml up -d --wait --wait-timeout 180/,
  );
  assert.doesNotMatch(commands, /forge-lane rollback compose/);
});

void test('restores the previous image when the release is unhealthy', () => {
  const { result, commands } = runDeploy(true);
  assert.notEqual(result.status, 0);
  assert.match(commands, /tag sha256:old-image forge-lane:rollback/);
  assert.match(
    commands,
    /forge-lane rollback compose -f compose\.prod\.yaml up -d --wait --wait-timeout 180/,
  );
});

void test('restores the previous image when the public endpoint is unhealthy', () => {
  const { result, commands } = runDeploy(false, false, false, true);
  assert.notEqual(result.status, 0);
  assert.match(commands, /curl .*https:\/\/example\.test\/forge\/api\/health/);
  assert.match(commands, /tag sha256:old-image forge-lane:rollback/);
  assert.match(
    commands,
    /forge-lane rollback compose -f compose\.prod\.yaml up -d --wait --wait-timeout 180/,
  );
  assert.doesNotMatch(commands, /tag registry\.example\.test\/team\/forge-lane:new forge-lane:latest/);
});

void test('deploys when Docker requires passwordless sudo', () => {
  const { result, commands } = runDeploy(false, true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    commands,
    /registry\.example\.test\/team\/forge-lane new compose -f compose\.prod\.yaml up -d --wait --wait-timeout 180/,
  );
});

void test('does not change running containers if registry pull fails', () => {
  const { result, commands } = runDeploy(false, true, true);
  assert.notEqual(result.status, 0);
  assert.match(commands, /pull registry\.example\.test\/team\/forge-lane:new/);
  assert.doesNotMatch(commands, /compose -f compose\.prod\.yaml up/);
});

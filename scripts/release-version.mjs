import { readFileSync, writeFileSync } from 'node:fs';

const packagePaths = ['apps/web/package.json', 'apps/server/package.json', 'packages/cli/package.json'];

function parseVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Invalid target version: ${version}`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Invalid target version: ${version}`);
  }
  return parts;
}

function currentPackages() {
  const packages = packagePaths.map((path) => ({ path, pkg: JSON.parse(readFileSync(path, 'utf8')) }));
  const versions = packages.map(({ pkg }) => pkg.version);
  if (new Set(versions).size !== 1) {
    throw new Error(`Package versions do not match: ${versions.join(', ')}`);
  }
  parseVersion(versions[0]);
  return packages;
}

try {
  const [command, target] = process.argv.slice(2);
  const packages = currentPackages();
  const current = packages[0].pkg.version;
  if (command === 'current' && target === undefined) {
    console.log(current);
  } else if (command === 'bump' && target !== undefined) {
    const requested = parseVersion(target);
    const existing = parseVersion(current);
    const isNewer = requested.findIndex((part, index) => part !== existing[index]);
    if (isNewer === -1 || requested[isNewer] < existing[isNewer]) {
      throw new Error(`Target version ${target} must be newer than ${current}`);
    }
    for (const { path, pkg } of packages) {
      pkg.version = target;
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    }
    console.log(`${current} -> ${target}`);
  } else {
    throw new Error('Usage: node scripts/release-version.mjs current | bump <major.minor.patch>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

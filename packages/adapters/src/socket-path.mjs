import { createHash } from 'node:crypto';
import { mkdir, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
export async function socketPath(dataDirectory, create = false) {
  const canonical = await realpath(dataDirectory);
  const key = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
  const directory = join('/tmp', `forge-${process.getuid()}-${key}`);
  if (create) {
    await mkdir(directory, { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid() ||
      (info.mode & 0o077) !== 0
    )
      throw new Error('Runtime directory is not private and owned');
  }
  return join(directory, 'core.sock');
}

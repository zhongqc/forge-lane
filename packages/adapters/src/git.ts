import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ForgeError } from '../../contracts/src/index';
import { resolveTool, runCommand } from './process';
import type { Repository } from '../../core/src/ports';
export async function inspectRepository(path: string, configuredGit = ''): Promise<Repository> {
  const executable = await resolveTool('git', configuredGit);
  let root: string;
  try {
    root = await realpath(path);
  } catch {
    throw new ForgeError('INVALID_REPOSITORY', '仓库路径不存在或无法读取');
  }
  const git = async (...args: string[]) => {
    const result = await runCommand(executable, ['-C', root, 'rev-parse', ...args], { cwd: root });
    if (result.code !== 0) throw new ForgeError('INVALID_REPOSITORY', '请选择可读取的非 bare Git 仓库');
    return result.stdout.trim();
  };
  if ((await git('--is-bare-repository')) !== 'false')
    throw new ForgeError('INVALID_REPOSITORY', '不支持 bare Git 仓库');
  return {
    repositoryPath: await realpath(await git('--show-toplevel')),
    gitCommonDir: await realpath(resolve(root, await git('--git-common-dir'))),
  };
}

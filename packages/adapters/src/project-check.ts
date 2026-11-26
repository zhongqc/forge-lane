import type { Project, ProjectCheck, Settings } from '../../contracts/src/index';
import { inspectRepository } from './git';
import { resolveTool, runCommand } from './process';
export async function checkProject(project: Project, settings: Settings): Promise<ProjectCheck> {
  const result: ProjectCheck = {
    checkedAt: new Date().toISOString(),
    status: 'warning',
    remote: null,
    defaultBranch: null,
    githubLogin: null,
    repositoryPermission: null,
    detail: '本地任务管理可用；自动执行尚未开放。',
  };
  try {
    const repository = await inspectRepository(project.repositoryPath, settings.gitPath);
    if (repository.gitCommonDir !== project.gitCommonDir)
      return { ...result, status: 'failed', detail: '仓库身份已变化；本地任务仍保留，请恢复原仓库路径。' };
    const git = await resolveTool('git', settings.gitPath);
    const read = (args: string[]) =>
      runCommand(git, ['-C', repository.repositoryPath, ...args], {
        cwd: repository.repositoryPath,
        timeoutMs: 4000,
        maxBytes: 4096,
      });
    const remote = await read(['remote', 'get-url', 'origin']);
    if (remote.code !== 0)
      return { ...result, detail: '未配置 origin；本地任务管理不受影响。请在 Git 中配置远端后重新检测。' };
    // Never display embedded URL credentials or query parameters from Git config.
    const raw = remote.stdout.trim();
    let slug: string | null = null;
    if (/^git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?$/.test(raw)) {
      result.remote = raw;
      slug = raw.slice(15).replace(/\.git$/, '');
    } else {
      try {
        const url = new URL(raw);
        result.remote = `${url.protocol}//${url.hostname}${url.pathname}`;
        if (url.hostname === 'github.com') slug = url.pathname.slice(1).replace(/\.git$/, '');
      } catch {
        result.remote = '本地路径或其他协议（已隐藏）';
      }
    }
    const branch = await read(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (branch.code === 0) result.defaultBranch = branch.stdout.trim().replace(/^origin\//, '');
    if (!slug || !/^[-\w.]+\/[-\w.]+$/.test(slug))
      return { ...result, detail: '已检测远端；尚未配置可验证的 GitHub 仓库。' };
    const gh = await resolveTool('gh', settings.ghPath);
    const [account, repo] = await Promise.all([
      runCommand(gh, ['api', 'user', '--jq', '.login'], { timeoutMs: 5000, maxBytes: 4096 }),
      runCommand(gh, ['api', `repos/${slug}`, '--jq', '{default_branch,permissions}'], {
        timeoutMs: 5000,
        maxBytes: 4096,
      }),
    ]);
    if (account.code === 0) result.githubLogin = account.stdout.trim();
    if (repo.code === 0) {
      const metadata = JSON.parse(repo.stdout);
      result.defaultBranch = metadata.default_branch;
      result.repositoryPermission = metadata.permissions?.push
        ? 'push'
        : metadata.permissions?.pull
          ? 'read'
          : 'unknown';
      result.detail = '仓库信息已验证。gh 身份不等同于 SSH push 身份；执行门禁仍关闭。';
    } else {
      result.status = 'unknown';
      result.detail = 'GitHub 仓库信息不可用（认证、网络或权限问题），可重新检测；本地任务管理不受影响。';
    }
    return result;
  } catch {
    return {
      ...result,
      status: 'unknown',
      detail: '仓库或工具检查未完成，请检查全局工具路径与本地仓库后重试；本地任务保留。',
    };
  }
}

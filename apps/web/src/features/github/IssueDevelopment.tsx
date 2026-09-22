import { useQuery } from '@tanstack/react-query';
import { GitPullRequest, GitCommitHorizontal, ExternalLink, GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Activity } from '../../../../../packages/shared/src/contracts';
import type { IssueDevelopment as Development } from '../../../../../packages/shared/src/github';
import { ErrorNotice } from '../../components/ui';
import { api } from '../../lib/api';
export function githubUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function GitHubLink({ url, children }: { url: unknown; children: ReactNode }) {
  const href = githubUrl(url);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={12} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
const states: Record<string, string> = {
  OPEN: '打开',
  CLOSED: '已关闭',
  MERGED: '已合并',
  open: '打开',
  closed: '已关闭',
  merged: '已合并',
};
export function IssueDevelopment({ issueId, issueKey }: { issueId: string; issueKey: string }) {
  const query = useQuery({
    queryKey: ['development', issueId],
    queryFn: () => api<Development>(`/issues/${issueId}/development`),
  });
  return (
    <section className="detail-section github-development">
      <div className="section-title">
        <h3>
          <GitBranch size={15} /> 开发关联
        </h3>
        <button className="text-button" disabled={query.isFetching} onClick={() => void query.refetch()}>
          刷新
        </button>
      </div>
      {query.isPending && (
        <p className="muted" role="status">
          正在加载开发记录…
        </p>
      )}
      <ErrorNotice error={query.error} />
      {query.data && (
        <>
          {!query.data.pullRequests.length && !query.data.commits.length && (
            <p className="muted">
              暂无关联 PR 或提交。在已连接仓库的分支名、PR 标题或正文、提交消息中加入 {issueKey}
              ，同步后将在这里显示。
            </p>
          )}
          {query.data.pullRequests.map((pr) => (
            <div className="github-development-row" key={pr.id}>
              <GitPullRequest size={16} />
              <div>
                <GitHubLink url={pr.url}>{pr.title}</GitHubLink>
                <small>
                  {pr.repository} #{pr.number} · {pr.branch} · {pr.author}
                </small>
              </div>
              <span className={`github-pr-state state-${pr.state.toLowerCase()}`}>
                {pr.draft && pr.state.toUpperCase() === 'OPEN' ? '草稿' : (states[pr.state] ?? pr.state)}
              </span>
            </div>
          ))}
          {query.data.commits.map((commit) => (
            <div className="github-development-row" key={commit.id}>
              <GitCommitHorizontal size={16} />
              <div>
                <GitHubLink url={commit.url}>{commit.message.split('\n')[0]}</GitHubLink>
                <small>
                  {commit.repository} · {commit.sha.slice(0, 7)} · {commit.author}
                </small>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function GitHubActivity({ activity }: { activity: Activity }) {
  const text = (key: string) =>
    typeof activity.payload[key] === 'string' ? (activity.payload[key] as string) : '';
  const action: Record<string, string> = {
    GITHUB_PR_LINKED: '关联了 PR',
    GITHUB_PR_UPDATED: '更新了 PR',
    GITHUB_COMMIT_LINKED: '关联了提交',
    GITHUB_AUTOMATION: '自动更新了事项状态',
  };
  return (
    <>
      <strong>GitHub · {text('githubActor') || activity.actorNameSnapshot}</strong>{' '}
      {action[activity.type] ?? '更新了开发记录'}
      <div className="github-activity">
        <GitHubLink url={activity.payload.url}>{text('title') || '查看 GitHub 记录'}</GitHubLink>
        <small>
          {text('repository')}
          {text('state') && ` · ${states[text('state')] ?? text('state')}`}
        </small>
      </div>
    </>
  );
}

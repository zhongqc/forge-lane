import { Injectable } from '@nestjs/common';
import { createSign } from 'node:crypto';

export interface RemotePR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  merged_at: string | null;
  draft: boolean;
  updated_at: string;
  head: { ref: string };
  user: { login: string };
  requested_reviewers?: unknown[];
  requested_teams?: unknown[];
}
export interface RemoteCommit {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { message: string; author: { name: string; date: string } };
}
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly retryAt = new Date(Date.now() + 60000),
    readonly status?: number,
  ) {
    super(message);
  }
}
@Injectable()
export class GitHubClient {
  configured() {
    return !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
  }
  private jwt() {
    const now = Math.floor(Date.now() / 1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const value = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(value);
    return `${value}.${signer.sign((process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'), 'base64url')}`;
  }
  async token(installationId: string): Promise<string> {
    const data = await this.call<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      this.jwt(),
      'POST',
    );
    return data.token;
  }
  async call<T>(path: string, token: string, method = 'GET'): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Forge-Lane',
        },
      });
    } catch {
      throw new GitHubError('无法连接 GitHub，请稍后重试');
    }
    if (!response.ok) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const after = Number(response.headers.get('retry-after')) * 1000;
      const retryAt = new Date(
        Math.max(
          Date.now() + 60000,
          Number.isFinite(reset) ? reset : 0,
          Date.now() + (Number.isFinite(after) ? after : 0),
        ),
      );
      throw new GitHubError(
        response.status === 404 || response.status === 403
          ? 'GitHub 仓库不可访问，请检查 App 安装范围、权限或 API 配额'
          : `GitHub 请求失败（${response.status}）`,
        retryAt,
        response.status,
      );
    }
    return response.json() as Promise<T>;
  }
  async repository(fullName: string, installationId: string) {
    const token = await this.token(installationId);
    return this.call<{ id: number; full_name: string }>(`/repos/${fullName}`, token);
  }
  async snapshot(fullName: string, installationId: string, since: Date | null, githubId?: string) {
    const token = await this.token(installationId);
    if (githubId) {
      const repository = await this.call<{ id: number; full_name: string }>(
        `/repositories/${githubId}`,
        token,
      );
      if (String(repository.id) !== githubId) throw new GitHubError('仓库身份不匹配，请重新连接');
      fullName = repository.full_name;
    }
    const pulls: RemotePR[] = [];
    // Newest updates first; include an overlap to reconcile concurrent deliveries.
    for (let page = 1; page <= 100; page++) {
      const batch = await this.call<RemotePR[]>(
        `/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
        token,
      );
      pulls.push(...batch);
      if (
        batch.length < 100 ||
        (since && batch.at(-1) && new Date(batch.at(-1)!.updated_at).getTime() < since.getTime() - 60000)
      )
        break;
      if (page === 100) throw new GitHubError('PR 数量超过单次同步上限，请联系管理员缩小仓库范围');
    }
    const commits: RemoteCommit[] = [];
    for (let page = 1; page <= 100; page++) {
      let batch: RemoteCommit[];
      try {
        batch = await this.call<RemoteCommit[]>(
          `/repos/${fullName}/commits?per_page=100&page=${page}${since ? `&since=${encodeURIComponent(new Date(since.getTime() - 60000).toISOString())}` : ''}`,
          token,
        );
      } catch (error) {
        // GitHub returns 409 when a repository has no commits yet.
        if (error instanceof GitHubError && error.status === 409 && page === 1) break;
        throw error;
      }
      commits.push(...batch);
      if (batch.length < 100) break;
      if (page === 100) throw new GitHubError('提交数量超过单次同步上限');
    }
    return { pulls, commits, fullName };
  }
}

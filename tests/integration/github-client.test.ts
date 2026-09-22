import { afterEach, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError } from '../../apps/server/src/modules/github/github.client';
afterEach(() => vi.restoreAllMocks());
it('resolves immutable repository identity and paginates using the canonical name', async () => {
  const client = new GitHubClient();
  vi.spyOn(client, 'token').mockResolvedValue('test-token');
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const path = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push(path);
    if (path.endsWith('/repositories/123')) return Response.json({ id: 123, full_name: 'renamed/new' });
    if (path.includes('/pulls?')) return Response.json([]);
    if (path.includes('/commits?') && new URL(path).searchParams.get('page') === '1')
      return Response.json(Array.from({ length: 100 }, (_, i) => ({ sha: String(i) })));
    return Response.json([]);
  });
  const result = await client.snapshot('old/name', '77', null, '123');
  expect(result.fullName).toBe('renamed/new');
  expect(result.commits).toHaveLength(100);
  expect(calls.slice(1).every((p) => p.startsWith('https://api.github.com/repos/renamed/new/'))).toBe(true);
  expect(calls.at(-1)).toContain('page=2');
});
it('rejects identity mismatch and treats an empty repository as a successful empty import', async () => {
  const client = new GitHubClient();
  vi.spyOn(client, 'token').mockResolvedValue('test-token');
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ id: 456, full_name: 'other/repo' }));
  await expect(client.snapshot('old/name', '77', null, '123')).rejects.toThrow('仓库身份不匹配');
  fetch.mockImplementation(async (url) =>
    (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes('/commits?')
      ? new Response('{}', { status: 409 })
      : Response.json([]),
  );
  await expect(client.snapshot('empty/repo', '77', null)).resolves.toEqual({
    pulls: [],
    commits: [],
    fullName: 'empty/repo',
  });
});
it('preserves GitHub rate-limit retry deadlines and never follows redirects', async () => {
  const client = new GitHubClient();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '3600' } }));
  const start = Date.now();
  try {
    await client.call('/repos/a/b', 'secret');
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).retryAt.getTime()).toBeGreaterThanOrEqual(start + 3600000);
  }
  expect(fetch.mock.calls[0][1]?.redirect).toBe('error');
});

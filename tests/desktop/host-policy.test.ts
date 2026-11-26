import { expect, it } from 'vitest';
import { canonicalRendererURL, authorizeToolPaths } from '../../apps/desktop/src/main/policy';
it('compares canonical document URLs while keeping other origins distinct', () => {
  expect(canonicalRendererURL('http://localhost:5173')).toBe('http://localhost:5173/');
  expect(canonicalRendererURL('http://localhost:5174')).not.toBe('http://localhost:5173/');
});
it('requires native authorization for changed typed tool paths, but accepts an explicit selection', async () => {
  const current = { gitPath: '', ghPath: '', codexPath: '' };
  const changed = { ...current, gitPath: '/bin/tool' };
  expect(await authorizeToolPaths(current, changed, new Set(), async () => false)).toBe(false);
  expect(await authorizeToolPaths(current, changed, new Set(['/bin/tool']), async () => false)).toBe(true);
  expect(await authorizeToolPaths(current, changed, new Set(), async () => true)).toBe(true);
  expect(await authorizeToolPaths(changed, changed, new Set(), async () => false)).toBe(true);
});

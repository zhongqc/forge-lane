import type { Settings } from '../../../../packages/contracts/src/index';
type ToolPaths = Pick<Settings, 'gitPath' | 'ghPath' | 'codexPath'>;
export function canonicalRendererURL(value: string): string {
  return new URL(value).href;
}
export async function authorizeToolPaths(
  current: ToolPaths,
  next: ToolPaths,
  selected: Set<string>,
  confirm: (paths: string[]) => Promise<boolean>,
): Promise<boolean> {
  const changed = (['gitPath', 'ghPath', 'codexPath'] as const)
    .filter((key) => next[key] && next[key] !== current[key] && !selected.has(next[key]))
    .map((key) => next[key]);
  return changed.length === 0 || (await confirm(changed));
}

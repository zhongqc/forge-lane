import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { SerialQueue } from '../../../../packages/shared/src/serial-queue';
import type { Issue, BoardData } from '../../../../packages/shared/src/contracts';
const queue = new SerialQueue();
export function runIssueCommand(
  qc: QueryClient,
  issue: Issue,
  operation: (current: Issue) => Promise<Issue>,
) {
  return queue.run(issue.id, async () => {
    const candidates = [
      qc.getQueryData<Issue>(['issue', issue.key]),
      qc.getQueryData<BoardData>(['board', issue.projectId])?.issues.find((i) => i.id === issue.id),
      issue,
    ].filter(Boolean) as Issue[];
    const current = candidates.sort((a, b) => b.version - a.version)[0];
    const result = await operation(current);
    qc.setQueryData(['issue', issue.key], result);
    qc.setQueryData<BoardData>(['board', issue.projectId], (b) =>
      b ? { ...b, issues: b.issues.map((i) => (i.id === issue.id ? result : i)) } : b,
    );
    void qc.invalidateQueries({ queryKey: ['activity', issue.id] });
    void qc.invalidateQueries({ queryKey: ['board', issue.projectId] });
    return result;
  });
}
export function useIssueMutation() {
  const qc = useQueryClient();
  return (issue: Issue, fields: Record<string, unknown>) =>
    runIssueCommand(qc, issue, (current) =>
      api<Issue>(
        `/issues/${issue.id}`,
        'PATCH',
        { version: current.version, ...fields },
        crypto.randomUUID(),
      ),
    );
}

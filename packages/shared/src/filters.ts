export function matchesQuick(
  issue: { type: string; assigneeId: string | null; priority: string; estimate: number | null },
  filters: string[],
  actorId: string,
) {
  const types = filters.filter((q) => ['STORY', 'TASK', 'BUG'].includes(q));
  if (types.length && !types.includes(issue.type)) return false;
  return filters
    .filter((q) => !types.includes(q))
    .every((q) =>
      q === 'mine'
        ? issue.assigneeId === actorId
        : q === 'unassigned'
          ? !issue.assigneeId
          : q === 'high'
            ? ['URGENT', 'HIGH'].includes(issue.priority)
            : q === 'noestimate'
              ? issue.estimate === null
              : true,
    );
}

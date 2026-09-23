import type { KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type Member = { id: string; name: string; email?: string; color: string };
export function useMembers(projectId: string, search: string | null) {
  const query = useQuery({
    queryKey: ['mention-members', projectId],
    queryFn: () => api<Member[]>(`/projects/${projectId}/mention-members`),
    enabled: !!projectId && search !== null,
    staleTime: 30000,
  });
  return {
    ...query,
    members: (query.data ?? [])
      .filter((m) =>
        `${m.name} ${m.email ?? ''}`.toLocaleLowerCase().includes((search ?? '').toLocaleLowerCase()),
      )
      .slice(0, 8),
  };
}
export function trigger(before: string) {
  return /(?:^|\s)@([^\s@[\]()`]*)$/.exec(before);
}
export function Menu({
  members,
  selected,
  pick,
  loading,
  error,
  position,
}: {
  members: Member[];
  selected: number;
  pick: (m: Member) => void;
  loading: boolean;
  error: unknown;
  position?: { left: number; top: number };
}) {
  return (
    <div
      style={
        position
          ? { position: 'fixed', left: position.left, top: position.top, bottom: 'auto', transform: 'none' }
          : undefined
      }
      className="mention-menu"
      role="listbox"
      aria-label="提及项目成员"
    >
      {members.map((m, i) => (
        <button
          type="button"
          role="option"
          aria-selected={i === selected}
          key={m.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(m)}
        >
          <span className="mention-member-dot" style={{ background: m.color }} />
          <span>
            {m.name}
            <small>{m.email ?? m.id.slice(0, 8)}</small>
          </span>
        </button>
      ))}
      {!members.length && (
        <p>{loading ? '加载成员…' : error ? '无法加载成员，请稍后重试' : '没有匹配的项目成员'}</p>
      )}
    </div>
  );
}
export function keyboard(
  e: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>,
  count: number,
  selected: number,
  setSelected: (n: number) => void,
  close: () => void,
  choose: () => void,
) {
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowDown') setSelected((selected + 1) % Math.max(count, 1));
  else if (e.key === 'ArrowUp') setSelected((selected + count - 1) % Math.max(count, 1));
  else if (e.key === 'Enter' && count) choose();
  else return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
}

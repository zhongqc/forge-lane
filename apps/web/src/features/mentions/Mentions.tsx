import { useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
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
export function MentionTextarea({
  projectId,
  value,
  onTextChange,
  onKeyDown,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  projectId: string;
  value: string;
  onTextChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [match, setMatch] = useState<{ start: number; end: number; search: string } | null>(null);
  const [selected, setSelected] = useState(0);
  const query = useMembers(projectId, match?.search ?? null);
  function update(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart);
    const found = trigger(before);
    // Markdown code, link labels/destinations, and indented code are never mention input.
    const line = before.split('\n').at(-1) ?? '';
    const fences = before.match(/^\s*(```|~~~)/gm)?.length ?? 0;
    const excluded =
      fences % 2 ||
      /^(?: {4}|\t)/.test(line) ||
      (line.match(/`/g)?.length ?? 0) % 2 ||
      line.lastIndexOf('[') > line.lastIndexOf(']') ||
      line.lastIndexOf('](') > line.lastIndexOf(')');
    setMatch(
      !composing.current && !excluded && found && el.selectionStart === el.selectionEnd
        ? { start: el.selectionStart - found[1]!.length - 1, end: el.selectionStart, search: found[1]! }
        : null,
    );
    setSelected(0);
  }
  function pick(m: Member) {
    if (
      !match ||
      !m ||
      ref.current?.selectionStart !== match.end ||
      ref.current?.selectionEnd !== match.end
    ) {
      setMatch(null);
      return;
    }
    const label = m.name.replace(/[\\[\]`*_]/g, '\\$&');
    const insertion = `[@${label}](/mentions/${m.id}) `;
    onTextChange(value.slice(0, match.start) + insertion + value.slice(match.end));
    const caret = match.start + insertion.length;
    setMatch(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  }
  return (
    <div className="mention-input">
      <textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          update(e.target);
        }}
        onClick={(e) => update(e.currentTarget)}
        onSelect={(e) => {
          if (
            match &&
            (e.currentTarget.selectionStart !== match.end || e.currentTarget.selectionEnd !== match.end)
          )
            setMatch(null);
        }}
        onBlur={() => setMatch(null)}
        onCompositionStart={() => {
          composing.current = true;
          setMatch(null);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          update(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (composing.current || e.nativeEvent.isComposing) return;
          if (
            !e.metaKey &&
            !e.ctrlKey &&
            match &&
            keyboard(
              e,
              query.members.length,
              Math.min(selected, query.members.length - 1),
              setSelected,
              () => setMatch(null),
              () => pick(query.members[Math.min(selected, query.members.length - 1)]!),
            )
          )
            return;
          onKeyDown?.(e);
        }}
      />
      {match && (
        <Menu
          members={query.members}
          selected={selected}
          pick={pick}
          loading={query.isPending}
          error={query.error}
        />
      )}
    </div>
  );
}

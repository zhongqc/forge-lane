import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Check,
  ChevronDown,
  Search,
  X,
  LoaderCircle,
  Zap,
  Bookmark,
  SquareCheck,
  GitBranch,
} from 'lucide-react';
import type { Actor, IssueType, Priority } from '../../../../packages/shared/src/contracts';
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            if (document.querySelector('.mention-menu')) e.preventDefault();
          }}
          className={`modal ${wide ? 'modal-wide' : ''}`}
          aria-describedby={undefined}
        >
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = '未设置',
  disabled = false,
}: {
  label: string;
  value: string | null | undefined;
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((o) => o.value === value);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setSearch('');
      }}
    >
      <Popover.Trigger className="select-trigger" aria-label={label} disabled={disabled}>
        {selected?.icon}
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="select-menu" sideOffset={5} align="start">
          <div className="select-search">
            <Search size={14} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`搜索${label}…`}
              aria-label={`搜索${label}`}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.currentTarget
                    .closest('.select-menu')
                    ?.querySelector<HTMLButtonElement>('[role=option]')
                    ?.focus();
                }
              }}
            />
          </div>
          <div
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]'),
                );
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
              }
            }}
          >
            {options
              .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
              .map((o) => (
                <button
                  role="option"
                  aria-selected={o.value === value}
                  key={o.value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.icon}
                  <span>{o.label}</span>
                  {o.value === value && <Check size={14} />}
                </button>
              ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function Avatar({
  actor,
  small = false,
}: {
  actor?: (Pick<Actor, 'name' | 'color'> & Partial<Pick<Actor, 'id' | 'avatarKey'>>) | null;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? 'avatar-small' : ''} ${!actor ? 'unassigned' : ''}`}
      title={actor?.name ?? '未分配'}
      style={actor ? { background: actor.color } : undefined}
    >
      {actor?.id && actor.avatarKey ? (
        <img
          key={actor.avatarKey}
          src={`/api/actors/${actor.id}/avatar?v=${encodeURIComponent(actor.avatarKey)}`}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      {actor?.name.slice(0, 1) ?? '–'}
    </span>
  );
}
export const typeLabels: Record<IssueType, string> = {
  EPIC: 'Epic',
  STORY: 'Story',
  TASK: 'Task',
  BUG: 'Bug',
  SUBTASK: 'Subtask',
};
export const priorityLabels: Record<Priority, string> = {
  URGENT: '紧急',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  NONE: '无优先级',
};
export function TypeIcon({ type }: { type: IssueType }) {
  return (
    <span className={`type-icon type-${type.toLowerCase()}`} aria-label={typeLabels[type]}>
      {type === 'BUG' ? (
        '●'
      ) : type === 'EPIC' ? (
        <Zap size={11} strokeWidth={2.3} fill="currentColor" aria-hidden="true" />
      ) : type === 'STORY' ? (
        <Bookmark size={11} strokeWidth={2.3} aria-hidden="true" />
      ) : type === 'SUBTASK' ? (
        <GitBranch size={11} strokeWidth={2.3} aria-hidden="true" />
      ) : (
        <SquareCheck size={11} strokeWidth={2.3} aria-hidden="true" />
      )}
    </span>
  );
}
export function PriorityIcon({ priority }: { priority: Priority }) {
  return (
    <span
      className={`priority priority-${priority.toLowerCase()}`}
      title={priorityLabels[priority]}
      aria-label={priorityLabels[priority]}
    >
      {{ URGENT: 'P0', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3', NONE: '—' }[priority]}
    </span>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="error-notice" role="alert">
      {error instanceof Error ? error.message : JSON.stringify(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} /> 正在加载工作空间…
    </div>
  );
}
export function MultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const selected = value ? value.split(',') : [];
  const [search, setSearch] = useState('');
  return (
    <Popover.Root>
      <Popover.Trigger className={`filter-chip ${selected.length ? 'selected' : ''}`}>
        {label}
        {selected.length > 0 && <span className="tiny-count">{selected.length}</span>}
        <ChevronDown size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="select-menu" align="start" sideOffset={5}>
          <div className="select-search">
            <Search size={13} />
            <input
              autoFocus
              aria-label={`搜索${label}`}
              placeholder={`搜索${label}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="multi-options">
            {options
              .filter((o) => o.value && o.label.toLowerCase().includes(search.toLowerCase()))
              .map((o) => (
                <label className="multi-option" key={o.value}>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    onChange={() =>
                      onChange(
                        selected.includes(o.value)
                          ? selected.filter((v) => v !== o.value).join(',')
                          : [...selected, o.value].join(','),
                      )
                    }
                  />
                  {o.label}
                </label>
              ))}
          </div>
          <button className="text-button" onClick={() => onChange('')}>
            清除此筛选
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

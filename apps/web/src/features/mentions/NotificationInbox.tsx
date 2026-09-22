import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '../../lib/api';
import { ErrorNotice } from '../../components/ui';
type Notification = {
  id: string;
  issueKey: string;
  projectKey: string;
  issueTitle: string;
  senderName: string;
  source: 'DESCRIPTION' | 'COMMENT';
  commentId: string | null;
  createdAt: string;
  readAt: string | null;
};
type Inbox = { items: Notification[]; nextCursor: string | null; unreadCount: number };
export function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<Inbox>(`/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor || undefined,
    refetchInterval: 30000,
  });
  const unread = query.data?.pages[0]?.unreadCount ?? 0;
  async function read(item?: Notification) {
    setBusy(true);
    setError(null);
    try {
      await api(item ? `/notifications/${item.id}/read` : '/notifications/read-all', 'POST');
      await qc.invalidateQueries({ queryKey: ['notifications'] });
      if (item) {
        setOpen(false);
        void navigate(`/issues/${item.issueKey}${item.commentId ? `#comment-${item.commentId}` : ''}`);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="icon-button notification-bell"
          aria-label={`通知${unread ? `，${unread} 条未读` : ''}`}
        >
          <Bell size={17} />
          {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="notification-inbox" align="end" sideOffset={10} aria-label="通知列表">
          <header>
            <strong>提及我的</strong>
            <button className="text-button" disabled={busy || !unread} onClick={() => void read()}>
              全部标为已读
            </button>
          </header>
          <ErrorNotice error={error ?? query.error} />
          {query.isPending ? (
            <p className="muted">正在加载通知…</p>
          ) : !query.data?.pages.some((p) => p.items.length) ? (
            <p className="muted">暂无提及通知</p>
          ) : (
            <div className="notification-items">
              {query.data.pages
                .flatMap((p) => p.items)
                .map((item) => (
                  <button
                    disabled={busy}
                    key={item.id}
                    className={item.readAt ? '' : 'unread'}
                    onClick={() => void read(item)}
                  >
                    <strong>
                      {item.senderName} 在{item.source === 'COMMENT' ? '评论' : '描述'}中提及了你
                    </strong>
                    <span>
                      {item.issueKey} · {item.issueTitle}
                    </span>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </button>
                ))}
            </div>
          )}
          {query.hasNextPage && (
            <button
              className="text-button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              加载更多
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

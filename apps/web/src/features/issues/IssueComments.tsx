import { lazy, Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Avatar, ErrorNotice, Loading } from '../../components/ui';
import { MarkdownView } from '../../components/MarkdownView';
import type { Issue, Comment } from '../../../../../packages/shared/src/contracts';
const MarkdownComposer = lazy(() => import('../editor/MarkdownComposer'));
// Drafts survive closing the drawer within this page session, scoped by actor and issue.
const commentDrafts = new Map<string, string>();
export function IssueComments({
  issue,
  comments,
  readOnly,
}: {
  issue: Issue;
  comments: Comment[];
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const me = qc.getQueryData<{ actor: { id: string } }>(['me']);
  const draftKey = `${me?.actor.id}:${issue.id}`;
  const [text, setText] = useState(() => commentDrafts.get(draftKey) ?? '');
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [edit, setEdit] = useState<Comment | null>(null);
  async function send() {
    if (!text.trim() || busy || readOnly) return;
    setError(null);
    setBusy(true);
    try {
      await api(`/issues/${issue.id}/comments${edit ? `/${edit.id}` : ''}`, edit ? 'PATCH' : 'POST', {
        content: text,
        ...(edit ? { version: edit.version } : {}),
      });
      if (!edit) commentDrafts.delete(draftKey);
      setText(edit ? (commentDrafts.get(draftKey) ?? '') : '');
      setGeneration((n) => n + 1);
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['comments', issue.id] });
      void qc.invalidateQueries({ queryKey: ['activity', issue.id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="comments">
        {comments.map((c) => (
          <div className="comment" id={`comment-${c.id}`} key={c.id}>
            <Avatar actor={c.actor} small />
            <div>
              <strong>{c.actor.name}</strong>
              <time>
                {new Date(c.createdAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {c.deletedAt ? (
                <div className="markdown">评论已删除</div>
              ) : (
                <MarkdownView markdown={c.content} />
              )}
              {!readOnly && !c.deletedAt && c.actorId === me?.actor.id && (
                <div className="comment-actions">
                  <button
                    onClick={() => {
                      if (busy) return;
                      setGeneration((n) => n + 1);
                      setError(null);
                      setEdit(c);
                      setText(c.content);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    aria-label="删除评论"
                    onClick={() =>
                      void api(`/issues/${issue.id}/comments/${c.id}`, 'DELETE', {
                        content: '删除',
                        version: c.version,
                      })
                        .then(() => qc.invalidateQueries({ queryKey: ['comments', issue.id] }))
                        .catch(setError)
                    }
                  >
                    <Trash2 size={11} />
                    删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <fieldset disabled={readOnly || busy} className="comment-composer">
        <Suspense fallback={<Loading />}>
          <MarkdownComposer
            key={`${draftKey}:${edit?.id ?? 'new'}:${generation}`}
            projectId={issue.projectId}
            compact
            text={text}
            onChange={(value) => {
              setText(value);
              if (!edit) {
                if (value.trim()) commentDrafts.set(draftKey, value);
                else commentDrafts.delete(draftKey);
              }
            }}
            busy={readOnly || busy}
            onSubmit={() => void send()}
          />
        </Suspense>
        <div>
          <span>离开后保留草稿 · ⌘ / Ctrl Enter 发布</span>
          {edit && (
            <button
              className="text-button"
              onClick={() => {
                setEdit(null);
                setText(commentDrafts.get(draftKey) ?? '');
                setGeneration((n) => n + 1);
                setError(null);
              }}
            >
              取消编辑
            </button>
          )}
          <button className="primary small" disabled={busy || !text.trim()} onClick={() => void send()}>
            <Send size={12} />
            {edit ? '保存评论' : '发送评论'}
          </button>
        </div>
      </fieldset>
      <ErrorNotice error={error} />
    </>
  );
}

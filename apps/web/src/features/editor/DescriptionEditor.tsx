import { useQueryClient } from '@tanstack/react-query';
import { runIssueCommand } from '../../lib/issue-mutations';
import { useEffect, useState } from 'react';
import MarkdownComposer from './MarkdownComposer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, PenLine, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Modal, ErrorNotice } from '../../components/ui';
import type { Issue } from '../../../../../packages/shared/src/contracts';
const drafts = new Map<string, { text: string; baseVersion: number; baseMarkdown: string }>();
export function discardDraft(id: string) {
  drafts.delete(id);
}
export function clearDrafts() {
  drafts.clear();
}
export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
export function DescriptionEditor({
  issue,
  readOnly = false,
  onSaved,
  onDirty,
}: {
  issue: Issue;
  readOnly?: boolean;
  onSaved: (i: Issue) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const existing = drafts.get(issue.id);
  const [editing, setEditing] = useState(!!existing);
  const [text, setText] = useState(existing?.text ?? issue.description);
  const [base, setBase] = useState(existing?.baseVersion ?? issue.version);
  const [baseMarkdown, setBaseMarkdown] = useState(existing?.baseMarkdown ?? issue.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [latest, setLatest] = useState<Issue | null>(null);
  const dirty = editing && text !== issue.description;
  useEffect(() => {
    onDirty(dirty);
    if (dirty) drafts.set(issue.id, { text, baseVersion: base, baseMarkdown });
    else drafts.delete(issue.id);
  }, [dirty, text, base, baseMarkdown, issue.id, onDirty]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  async function save(version?: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runIssueCommand(qc, issue, (current) =>
        api<Issue>(
          `/issues/${issue.id}`,
          'PATCH',
          {
            description: text,
            version: version ?? (current.description === baseMarkdown ? current.version : base),
          },
          crypto.randomUUID(),
        ),
      );
      drafts.delete(issue.id);
      setLatest(null);
      setEditing(false);
      onDirty(false);
      onSaved(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setLatest(await api<Issue>(`/issues/${issue.id}`));
        } catch (err) {
          setError(err);
        }
      } else setError(e);
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    drafts.delete(issue.id);
    setText(issue.description);
    setBase(issue.version);
    setBaseMarkdown(issue.description);
    setEditing(false);
    onDirty(false);
    setError(null);
  }
  if (readOnly) return <MarkdownView markdown={issue.description || '暂无描述'} />;
  if (!editing)
    return (
      <div className="description-display">
        <button
          className="description-edit"
          aria-label="编辑描述"
          onClick={() => {
            setText(issue.description);
            setBase(issue.version);
            setBaseMarkdown(issue.description);
            setEditing(true);
          }}
        >
          <PenLine size={14} />
        </button>
        {issue.description ? (
          <div
            onDoubleClick={() => {
              setText(issue.description);
              setBase(issue.version);
              setBaseMarkdown(issue.description);
              setEditing(true);
            }}
          >
            <MarkdownView markdown={issue.description} />
          </div>
        ) : (
          <button
            className="description-placeholder"
            onClick={() => {
              setBase(issue.version);
              setBaseMarkdown(issue.description);
              setEditing(true);
            }}
          >
            添加描述…<span>说明背景、目标和验收标准，让协作更清晰。</span>
          </button>
        )}
      </div>
    );
  return (
    <div>
      <MarkdownComposer
        key={`${issue.id}:${base}`}
        text={text}
        onChange={setText}
        busy={busy}
        onSubmit={() => void save()}
      />
      <ErrorNotice error={error} />
      <div className="editor-footer">
        <span>{busy ? '正在保存…' : '支持 Markdown 快捷输入 · ⌘ Enter 保存'}</span>
        <button className="secondary small" onClick={cancel} disabled={busy}>
          <X size={13} />
          取消
        </button>
        <button className="primary small" onClick={() => void save()} disabled={busy}>
          <Check size={13} />
          保存描述
        </button>
      </div>
      <Modal
        open={!!latest}
        onOpenChange={(v) => {
          if (!v) setLatest(null);
        }}
        title="描述有新版本"
        wide
      >
        <p className="muted">有人在你编辑时更新了事项。本地草稿已保留，请比较后选择。</p>
        <div className="conflict-columns">
          <section>
            <h4>你的草稿</h4>
            <MarkdownView markdown={text} />
          </section>
          <section>
            <h4>最新版本</h4>
            <MarkdownView markdown={latest?.description ?? ''} />
          </section>
        </div>
        <footer className="modal-footer">
          <button
            className="secondary"
            onClick={() => {
              if (latest) {
                setText(latest.description);
                setBase(latest.version);
                setBaseMarkdown(latest.description);
                onSaved(latest);
                setLatest(null);
              }
            }}
          >
            使用最新内容
          </button>
          <button className="primary" disabled={busy} onClick={() => latest && void save(latest.version)}>
            保留我的内容并保存
          </button>
        </footer>
      </Modal>
    </div>
  );
}

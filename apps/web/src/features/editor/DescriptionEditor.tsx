import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';
import { runIssueCommand } from '../../lib/issue-mutations';
import { useEffect, useRef, useState } from 'react';
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  linkPlugin,
  linkDialogPlugin,
  markdownShortcutPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertCodeBlock,
  Separator,
  StrikeThroughSupSubToggles,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
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
  const [slash, setSlash] = useState(false);
  const [slashSearch, setSlashSearch] = useState('');
  const [error, setError] = useState<unknown>();
  const [latest, setLatest] = useState<Issue | null>(null);
  const editor = useRef<MDXEditorMethods>(null);
  const composing = useRef(false);
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
    // Keyboard events bubble from the nested editor and toolbar; the group itself is not interactive.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label="描述编辑器"
      className="editor-wrap"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(e) => {
        if (e.key === '/' && !composing.current && !busy) {
          const selection = window.getSelection();
          const node = selection?.anchorNode;
          const block = (node instanceof Element ? node : node?.parentElement)?.closest('p');
          if ((block && !block.textContent?.trim()) || !editor.current?.getMarkdown().trim()) {
            e.preventDefault();
            e.stopPropagation();
            setSlashSearch('');
            setSlash(true);
            return;
          }
        }

        if (
          (e.metaKey || e.ctrlKey) &&
          e.key === 'Enter' &&
          !composing.current &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <MDXEditor
        readOnly={busy}
        ref={editor}
        markdown={text}
        onChange={(v, initialNormalization) => {
          if (!initialNormalization) setText(v);
        }}
        contentEditableClassName="markdown editor-content"
        placeholder="写下背景、方案或验收标准…"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              text: '纯文本',
              js: 'JavaScript',
              ts: 'TypeScript',
              typescript: 'TypeScript',
              javascript: 'JavaScript',
              json: 'JSON',
              bash: 'Shell',
              python: 'Python',
            },
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                <StrikeThroughSupSubToggles options={['Strikethrough']} />
                <Separator />
                <ListsToggle />
                <CreateLink />
                <InsertCodeBlock />
              </>
            ),
          }),
        ]}
      />
      <Popover.Root open={slash} onOpenChange={setSlash}>
        <Popover.Anchor asChild>
          <span className="slash-anchor" />
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            className="select-menu slash-menu"
            align="start"
            side="bottom"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="select-search">
              <input
                autoFocus
                placeholder="插入内容…"
                aria-label="搜索插入命令"
                value={slashSearch}
                onChange={(e) => setSlashSearch(e.target.value)}
              />
            </div>
            <div role="menu" aria-label="插入内容">
              {[
                { label: '一级标题', md: '# 标题' },
                { label: '二级标题', md: '## 标题' },
                { label: '项目列表', md: '- 列表项' },
                { label: '有序列表', md: '1. 列表项' },
                { label: '任务清单', md: '- [ ] 待完成事项' },
                { label: '引用', md: '> 引用内容' },
                { label: '代码块', md: '```text\n代码\n```' },
                { label: '链接', md: '[链接文字](https://example.com)' },
              ]
                .filter((c) => c.label.includes(slashSearch))
                .map((c) => (
                  <button
                    role="menuitem"
                    key={c.label}
                    onClick={() => {
                      setSlash(false);
                      editor.current?.focus(() => editor.current?.insertMarkdown(c.md));
                    }}
                  >
                    {c.label}
                  </button>
                ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
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
                editor.current?.setMarkdown(latest.description);
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

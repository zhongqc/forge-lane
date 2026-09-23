import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
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
import { MentionProject, mentionsPlugin } from '../mentions/RichMentions';
export default function MarkdownComposer({
  projectId,
  text,
  onChange,
  busy = false,
  onSubmit,
  compact = false,
}: {
  projectId: string;
  text: string;
  onChange: (value: string) => void;
  busy?: boolean;
  onSubmit?: () => void;
  compact?: boolean;
}) {
  const editor = useRef<MDXEditorMethods>(null);
  const composing = useRef(false);
  const [slash, setSlash] = useState(false);
  const [slashSearch, setSlashSearch] = useState('');
  return (
    // Keyboard events bubble from the nested editor and toolbar; the group itself is not interactive.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="group"
      aria-label={compact ? '评论编辑器' : '描述编辑器'}
      className={compact ? 'editor-wrap editor-compact' : 'editor-wrap'}
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
          onSubmit?.();
        }
      }}
    >
      <MentionProject.Provider value={projectId}>
        <MDXEditor
          translation={(key, defaultValue, values) =>
            key === 'contentArea.editableMarkdown' && compact
              ? '评论内容'
              : defaultValue.replace(/{{(.*?)}}/g, (match, name: string) => String(values?.[name] ?? match))
          }
          readOnly={busy}
          ref={editor}
          markdown={text}
          onChange={(v, initialNormalization) => {
            if (!initialNormalization) onChange(v);
          }}
          contentEditableClassName="markdown editor-content"
          placeholder={compact ? '写评论，输入 @ 提及成员…' : '写下背景、方案或验收标准…'}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            linkPlugin(),
            mentionsPlugin(),
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
                  {!compact && (
                    <>
                      <UndoRedo />
                      <Separator />
                    </>
                  )}
                  <BlockTypeSelect />
                  <Separator />
                  <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
                  {!compact && <StrikeThroughSupSubToggles options={['Strikethrough']} />}
                  <Separator />
                  <ListsToggle />
                  <CreateLink />
                  <InsertCodeBlock />
                </>
              ),
            }),
          ]}
        />
      </MentionProject.Provider>
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
                    type="button"
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
    </div>
  );
}

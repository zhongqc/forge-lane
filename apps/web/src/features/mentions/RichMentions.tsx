import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { activeEditor$, addComposerChild$, realmPlugin } from '@mdxeditor/editor';
import { useCellValue } from '@mdxeditor/gurx';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from 'lexical';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { useMembers, trigger, Menu, keyboard, type Member } from './Mentions';
export const MentionProject = createContext('');
function RichMentions() {
  const editor = useCellValue(activeEditor$);
  const project = useContext(MentionProject);
  const [search, setSearch] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [selected, setSelected] = useState(0);
  const query = useMembers(project, search);
  const dismiss = useRef<string | null>(null);
  const current = useRef({ search, selected, members: query.members });
  useEffect(() => {
    current.current = { search, selected, members: query.members };
  }, [search, selected, query.members]);
  function inspect() {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text')
      return null;
    const node = selection.anchor.getNode();
    if (
      !$isTextNode(node) ||
      node.hasFormat('code') ||
      node.getParents().some((n) => $isLinkNode(n) || /code/i.test(n.getType()))
    )
      return null;
    const match = trigger(node.getTextContent().slice(0, selection.anchor.offset));
    return match ? { selection, match, offset: selection.anchor.offset, node } : null;
  }
  const pickRef = useRef<(m: Member) => void>(() => {});
  useEffect(() => {
    pickRef.current = (m) => {
      if (!m) return;
      editor?.update(() => {
        const found = inspect();
        if (!found) return;
        const { selection, match, offset, node } = found;
        selection.anchor.set(node.getKey(), offset - match[1]!.length - 1, 'text');
        selection.focus.set(node.getKey(), offset, 'text');
        const link = $createLinkNode(`/mentions/${m.id}`);
        link.append($createTextNode(`@${m.name}`));
        selection.insertNodes([link, $createTextNode(' ')]);
      });
      setSearch(null);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const unregister = editor.registerUpdateListener(({ editorState }) =>
      editorState.read(() => {
        const found = editor.isComposing() ? null : inspect();
        const next = found?.match[1] ?? null;
        if (found) {
          const selection = window.getSelection();
          const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
          if (rect)
            setPosition({
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 280)),
              top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 340)),
            });
        }
        if (next !== dismiss.current) dismiss.current = null;
        setSearch(next === dismiss.current ? null : next);
        setSelected((n) => (current.current.search === next ? n : 0));
      }),
    );
    const unregisterKey = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (e) => {
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.isComposing ||
          editor.isComposing() ||
          current.current.search === null
        )
          return false;
        const { members, selected } = current.current;
        return keyboard(
          e,
          members.length,
          Math.min(selected, members.length - 1),
          setSelected,
          () => {
            dismiss.current = current.current.search;
            setSearch(null);
          },
          () => pickRef.current(members[Math.min(selected, members.length - 1)]!),
        );
      },
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      unregister();
      unregisterKey();
    };
  }, [editor]);
  return search !== null ? (
    <Menu
      position={position}
      members={query.members}
      selected={Math.min(selected, query.members.length - 1)}
      pick={(m) => pickRef.current(m)}
      loading={query.isPending}
      error={query.error}
    />
  ) : null;
}
export const mentionsPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, RichMentions);
  },
});

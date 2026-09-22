import { fromMarkdown } from 'mdast-util-from-markdown';
type RootContent = ReturnType<typeof fromMarkdown>['children'][number];

// Parse structure, never regex the raw document: code and HTML examples are not mentions.
export function mentionIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  function visit(node: RootContent) {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
    if (node.type === 'link') {
      const match = /^\/mentions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        node.url,
      );
      if (match) ids.add(match[1]!.toLowerCase());
    }
    if ('children' in node) for (const child of node.children) visit(child);
  }
  for (const node of fromMarkdown(markdown).children) visit(node);
  return ids;
}

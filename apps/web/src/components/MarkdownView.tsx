import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            /^\/mentions\/[0-9a-f-]{36}$/i.test(href ?? '') ? (
              <span className="mention-chip">{children}</span>
            ) : (
              <a href={href}>{children}</a>
            ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

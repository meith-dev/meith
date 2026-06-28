import { CodeBlock } from "@/components/code-block";
import { A, Code, H2, H3, OL, P, UL } from "@/components/docs/prose";
import { resolveMarkdownHref } from "@/lib/docs";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h2: ({ children, ...props }) => <H2 id={props.id}>{children}</H2>,
  h3: ({ children, ...props }) => <H3 id={props.id}>{children}</H3>,
  p: ({ children }) => <P>{children}</P>,
  ul: ({ children }) => <UL>{children}</UL>,
  ol: ({ children }) => <OL>{children}</OL>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => {
    const resolvedHref = resolveMarkdownHref(href);
    return resolvedHref ? <A href={resolvedHref}>{children}</A> : <>{children}</>;
  },
  code: ({ children, className }) => {
    const code = String(children).replace(/\n$/, "");
    const language = /language-(\w+)/.exec(className ?? "")?.[1];

    if (className) {
      return <CodeBlock code={code} language={language} className="mt-5" />;
    }

    return <Code>{children}</Code>;
  },
  blockquote: ({ children }) => (
    <blockquote className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mt-6 overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50 text-left">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 align-top font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 align-top leading-relaxed text-muted-foreground">
      {children}
    </td>
  ),
};

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

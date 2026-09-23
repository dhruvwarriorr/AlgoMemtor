import { isValidElement, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ''
}

// Fenced code from the coach: a labelled block with a copy action. Inline
// `code` spans are rendered by the `code` component below.
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const element = isValidElement<{ className?: string; children?: ReactNode }>(
    children,
  )
    ? children
    : null
  const language = element?.props.className?.replace(/^language-/, '')
  const text = textOf(element?.props.children ?? children).replace(/\n$/, '')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-secondary/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language || 'code'}</span>
        <button
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-background hover:text-foreground"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[0.85rem] leading-6 text-foreground">
        <code>{text}</code>
      </pre>
    </div>
  )
}

type CoachMessageContentProps = {
  content: string
  role: 'user' | 'assistant'
}

export function CoachMessageContent({
  content,
  role,
}: CoachMessageContentProps) {
  if (role === 'user') {
    return (
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{content}</p>
    )
  }

  return (
    <div className="mt-3 text-sm leading-6 text-foreground">
      <Markdown
        components={{
          a: ({ children, href }) => (
            <a
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-2 border-primary/50 pl-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
              {children}
            </code>
          ),
          h1: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-2 mt-4 font-semibold text-foreground">
              {children}
            </h4>
          ),
          hr: () => <hr className="my-5 border-border" />,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0">{children}</p>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border bg-secondary/60 px-3 py-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3 py-2 align-top">
              {children}
            </td>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1.5 pl-5">{children}</ul>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {content}
      </Markdown>
    </div>
  )
}

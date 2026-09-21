import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

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
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
        {content}
      </p>
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
          code: ({ children, className }) => {
            const isBlock = className?.startsWith('language-')
            return (
              <code
                className={cn(
                  'rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em] text-foreground',
                  isBlock &&
                    'block overflow-x-auto rounded-lg border border-border p-3 leading-6',
                )}
              >
                {children}
              </code>
            )
          },
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
          pre: ({ children }) => <div className="my-3">{children}</div>,
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

import { useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

// A plain textarea with line numbers. Tab indents; Escape then Tab leaves the
// editor, so keyboard users are never trapped.
export function CodeEditor({
  id,
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  errorLine,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  maxLength: number
  errorLine?: number
  describedBy?: string
}) {
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const escapedRef = useRef(false)
  const lineCount = Math.max(1, value.split('\n').length)

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      escapedRef.current = true
      return
    }
    if (
      event.key !== 'Tab' ||
      escapedRef.current ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      escapedRef.current = false
      return
    }
    event.preventDefault()
    const target = event.currentTarget
    const { selectionStart, selectionEnd } = target
    const indent = '    '
    if (event.shiftKey) {
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const removable =
        value.slice(lineStart, lineStart + 4).match(/^ {1,4}/)?.[0].length ?? 0
      if (removable === 0) return
      const next =
        value.slice(0, lineStart) + value.slice(lineStart + removable)
      onChange(next)
      requestAnimationFrame(() => {
        target.selectionStart = Math.max(lineStart, selectionStart - removable)
        target.selectionEnd = Math.max(lineStart, selectionEnd - removable)
      })
      return
    }
    const next =
      value.slice(0, selectionStart) + indent + value.slice(selectionEnd)
    if (next.length > maxLength) return
    onChange(next)
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd =
        selectionStart + indent.length
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="flex min-h-72 min-w-0 overflow-hidden rounded-lg border border-input bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15">
        <div
          aria-hidden="true"
          className="shrink-0 overflow-hidden border-r border-border bg-secondary/40 py-2.5 pr-2 pl-3 text-right font-mono text-xs leading-5 text-muted-foreground select-none"
          ref={gutterRef}
        >
          {Array.from({ length: lineCount }, (_, index) => (
            <div
              className={cn(
                errorLine === index + 1 &&
                  'font-semibold text-danger-foreground',
              )}
              key={index}
            >
              {index + 1}
            </div>
          ))}
        </div>
        <textarea
          aria-describedby={describedBy}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="min-h-72 w-full min-w-0 flex-1 resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre text-foreground outline-none placeholder:text-muted-foreground"
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (gutterRef.current !== null) {
              gutterRef.current.scrollTop = event.currentTarget.scrollTop
            }
          }}
          placeholder={placeholder}
          rows={Math.min(28, Math.max(14, lineCount + 1))}
          spellCheck={false}
          value={value}
          wrap="off"
        />
      </div>
    </div>
  )
}

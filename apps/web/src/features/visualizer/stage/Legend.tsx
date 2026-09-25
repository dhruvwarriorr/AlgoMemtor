const legend: { className: string; label: string }[] = [
  { className: 'border-primary/70 bg-primary/10', label: 'read on this step' },
  {
    className: 'border-amber-500 bg-amber-100 dark:bg-amber-400/20',
    label: 'written on this step',
  },
  { className: 'border-go/60 bg-go-soft', label: 'changed or added' },
  {
    className: 'border-dashed border-primary/45 bg-primary/[0.07]',
    label: 'window between two pointers (l…r)',
  },
  {
    className: 'border-fuchsia-500 bg-fuchsia-500/10',
    label: 'line or step the AI Debugger flagged',
  },
]

export function Legend() {
  return (
    <details className="group relative text-xs">
      <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-border px-2.5 font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Colours
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-lift">
        <ul className="grid gap-2">
          {legend.map((item) => (
            <li
              className="flex items-center gap-2 text-foreground"
              key={item.label}
            >
              <span
                aria-hidden="true"
                className={`size-4 shrink-0 rounded border ${item.className}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-2 leading-5 text-muted-foreground">
          Space plays and pauses, ← and → step, Home and End jump. Click a
          variable to pause whenever it changes; click a line number to set a
          breakpoint.
        </p>
      </div>
    </details>
  )
}

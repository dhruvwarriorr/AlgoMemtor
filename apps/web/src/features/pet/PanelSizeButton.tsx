// Toggles the pet chat box between its default and a large size.
export function PanelSizeButton({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  const label = expanded ? 'Shrink chat' : 'Expand chat'
  return (
    <button
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onToggle}
      title={label}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 24 24"
      >
        {expanded ? (
          // Arrows pointing in: shrink.
          <path d="M10 4v6H4M14 20v-6h6M10 10 4 4M14 14l6 6" />
        ) : (
          // Arrows pointing out: expand.
          <path d="M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6" />
        )}
      </svg>
    </button>
  )
}

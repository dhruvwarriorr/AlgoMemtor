import type { CellTip } from '@/lib/cell-tip'

// Floating label for heatmap-style grids; the parent must be `relative`.
export function CellTooltip({ tip }: { tip: CellTip | null }) {
  if (tip === null) return null
  return (
    <div
      className="pointer-events-none absolute z-20 w-max -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-lg bg-ink px-2.5 py-1.5 text-center text-ink-foreground shadow-lift"
      role="status"
      style={{ left: tip.x, top: tip.y }}
    >
      <p className="text-sm font-semibold tabular-nums">{tip.title}</p>
      <p className="text-[0.7rem] opacity-70">{tip.detail}</p>
    </div>
  )
}

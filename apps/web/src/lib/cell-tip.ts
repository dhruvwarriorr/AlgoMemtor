export type CellTip = {
  x: number
  y: number
  title: string
  detail: string
}

// Position a tooltip over the hovered cell, relative to `container`, and keep
// it inside the container horizontally.
export function cellTipFrom(
  cell: Element,
  container: HTMLElement | null,
  title: string,
  detail: string,
): CellTip | null {
  if (container === null) return null
  const bounds = container.getBoundingClientRect()
  const rect = cell.getBoundingClientRect()
  const margin = 72
  const x = Math.min(
    Math.max(rect.left + rect.width / 2 - bounds.left, margin),
    Math.max(margin, bounds.width - margin),
  )
  return { x, y: rect.top - bounds.top, title, detail }
}

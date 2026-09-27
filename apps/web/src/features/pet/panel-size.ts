// The pet chat box's size: the learner drags a corner or toggles between the
// default and a large box. The choice is a per-browser convenience.

export type PanelSize = { width: number; height: number }

export const DEFAULT_PANEL_SIZE: PanelSize = { width: 340, height: 460 }
export const LARGE_PANEL_SIZE: PanelSize = { width: 620, height: 720 }
export const MIN_PANEL_SIZE: PanelSize = { width: 300, height: 320 }

const sizeKey = 'algomemtor-pet-panel-size'

export function readPanelSize(): PanelSize {
  try {
    const raw = window.localStorage.getItem(sizeKey)
    if (raw === null) return DEFAULT_PANEL_SIZE
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'width' in parsed &&
      'height' in parsed &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return {
        width: Math.max(MIN_PANEL_SIZE.width, parsed.width),
        height: Math.max(MIN_PANEL_SIZE.height, parsed.height),
      }
    }
  } catch {
    // Unavailable storage falls back to the default size.
  }
  return DEFAULT_PANEL_SIZE
}

export function savePanelSize(size: PanelSize) {
  try {
    window.localStorage.setItem(sizeKey, JSON.stringify(size))
  } catch {
    // The size then lasts for this visit only.
  }
}

// Wider than the default counts as expanded, so a dragged size can shrink back.
export const isExpanded = (size: PanelSize) =>
  size.width > DEFAULT_PANEL_SIZE.width + 40 ||
  size.height > DEFAULT_PANEL_SIZE.height + 40

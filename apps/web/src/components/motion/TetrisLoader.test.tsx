import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TetrisLoader } from './TetrisLoader'
import { generateTetrisFrames } from './tetris-frames'

describe('TetrisLoader', () => {
  it('generates complete board frames with supported cell values', () => {
    const frames = generateTetrisFrames(8, 12)

    expect(frames.length).toBeGreaterThan(12)
    expect(frames.every((frame) => frame.length === 96)).toBe(true)
    expect(
      frames.every((frame) =>
        frame.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 9),
      ),
    ).toBe(true)
  })

  it('renders an accessible board with the requested dimensions', () => {
    const markup = renderToStaticMarkup(
      <TetrisLoader columns={4} label="Coach is thinking" rows={6} />,
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-label="Coach is thinking"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup.match(/data-tetris-cell/g)).toHaveLength(24)
  })
})

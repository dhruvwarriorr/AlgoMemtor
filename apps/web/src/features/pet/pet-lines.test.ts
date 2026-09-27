import { describe, expect, it, vi } from 'vitest'

import {
  currentPetActivity,
  type PetSaid,
  endPetActivity,
  onPetSay,
  startPetActivity,
} from './mello-events'
import { routeLine } from './pet-lines'

describe('routeLine', () => {
  it('greets each page with its own line', () => {
    expect(routeLine('/visualizer')?.message).toContain('code run')
    expect(routeLine('/progress/report')?.message).toContain('report')
    expect(routeLine('/progress')?.message).toContain('far you have come')
    expect(routeLine('/unknown')).toBeNull()
  })
})

describe('pet activities', () => {
  it('follows the latest activity and speaks when one ends', () => {
    const said = vi.fn<(line: PetSaid) => void>()
    const stop = onPetSay(said)
    startPetActivity('sync', 'reading', 'Reading your latest solves…')
    expect(currentPetActivity()).toBe('reading')
    endPetActivity('sync', { message: 'All synced!', state: 'success' })
    expect(currentPetActivity()).toBeNull()
    expect(said.mock.calls.map(([line]) => line.message)).toEqual([
      'Reading your latest solves…',
      'All synced!',
    ])
    stop()
  })
})

import { describe, expect, it } from 'vitest'

import { normalizeTopic, normalizeTopicCounts } from './topic-normalization.js'

describe('analytics topic normalization', () => {
  it('groups known provider tags into a fixed learning vocabulary', () => {
    expect(normalizeTopic('hash-table')).toBe('Hashing')
    expect(normalizeTopic('Quickselect')).toBe('Sorting')
    expect(normalizeTopic('Network Flow')).toBe('Graphs')
    expect(normalizeTopic('FFT')).toBe('Math')
    expect(normalizeTopic('Queue')).toBe('Data Structures')
    expect(normalizeTopic('Expression Parsing')).toBe('Data Structures')
    expect(normalizeTopic('2-sat')).toBe('Graphs')
    expect(normalizeTopic('Doubly-Linked List')).toBe('Data Structures')
    expect(normalizeTopic('Meet-in-the-Middle')).toBe('Divide and Conquer')
  })

  it('excludes contest codes, generic labels, and tagless entries', () => {
    expect(normalizeTopic('START254')).toBeUndefined()
    expect(normalizeTopic('Nishank ADM')).toBeUndefined()
    expect(normalizeTopic('Special')).toBeUndefined()
    expect(normalizeTopic('Communication')).toBeUndefined()
    expect(normalizeTopic('')).toBeUndefined()
    expect(
      normalizeTopicCounts({
        Array: 8,
        Matrix: 2,
        START254: 5,
        Greedy: 3,
        Communication: 1,
      }),
    ).toEqual({ Arrays: 10, Greedy: 3 })
  })
})

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

  it('groups CSES problem-set sections and leaves mixed sections out', () => {
    expect(normalizeTopic('introductory-problems')).toBe('Implementation')
    expect(normalizeTopic('sorting-and-searching')).toBe('Sorting')
    expect(normalizeTopic('dynamic-programming')).toBe('Dynamic Programming')
    expect(normalizeTopic('graph-algorithms')).toBe('Graphs')
    expect(normalizeTopic('tree-algorithms')).toBe('Trees')
    expect(normalizeTopic('range-queries')).toBe('Data Structures')
    expect(normalizeTopic('string-algorithms')).toBe('Strings')
    expect(normalizeTopic('bitwise-operations')).toBe('Bit Manipulation')
    expect(normalizeTopic('sliding-window-problems')).toBe('Sliding Window')
    expect(normalizeTopic('cses')).toBeUndefined()
    expect(normalizeTopic('additional-problems-i')).toBeUndefined()
    expect(normalizeTopic('advanced-techniques')).toBeUndefined()
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

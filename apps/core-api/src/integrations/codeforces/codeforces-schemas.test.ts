import { describe, expect, it } from 'vitest'

import {
  CodeforcesProblemSchema,
  CodeforcesProblemStatisticsSchema,
  CodeforcesProblemsetEnvelopeSchema,
  CodeforcesProblemsetResponseSchema,
} from './codeforces-schemas.js'

const problem = {
  contestId: 4,
  index: 'A',
  name: 'Watermelon',
  type: 'PROGRAMMING',
  rating: 800,
  tags: ['brute force', 'math'],
} as const

describe('Codeforces raw schemas', () => {
  it('accepts a valid successful problemset response', () => {
    const parsed = CodeforcesProblemsetResponseSchema.parse({
      status: 'OK',
      result: {
        problems: [problem],
        problemStatistics: [{ contestId: 4, index: 'A', solvedCount: 300_000 }],
      },
    })

    expect(parsed.status).toBe('OK')
  })

  it('accepts a failed response with a provider comment', () => {
    expect(
      CodeforcesProblemsetResponseSchema.parse({
        status: 'FAILED',
        comment: 'Call limit exceeded',
      }),
    ).toEqual({ status: 'FAILED', comment: 'Call limit exceeded' })
  })

  it('accepts documented optional problem fields when omitted', () => {
    expect(
      CodeforcesProblemSchema.safeParse({
        index: 'A',
        name: 'Custom problem',
        type: 'QUESTION',
        tags: [],
      }).success,
    ).toBe(true)
  })

  it.each([
    ['a string rating', { ...problem, rating: '800' }],
    ['a negative rating', { ...problem, rating: -1 }],
    ['a fractional contest ID', { ...problem, contestId: 4.5 }],
    ['an unknown problem type', { ...problem, type: 'OTHER' }],
    ['an empty tag', { ...problem, tags: ['math', '  '] }],
  ])('rejects a problem with %s', (_label, value) => {
    expect(CodeforcesProblemSchema.safeParse(value).success).toBe(false)
  })

  it.each([
    ['a missing solved count', { contestId: 4, index: 'A' }],
    ['a negative solved count', { contestId: 4, index: 'A', solvedCount: -1 }],
    [
      'a fractional solved count',
      { contestId: 4, index: 'A', solvedCount: 1.5 },
    ],
  ])('rejects statistics with %s', (_label, value) => {
    expect(CodeforcesProblemStatisticsSchema.safeParse(value).success).toBe(
      false,
    )
  })

  it('rejects malformed success and failure envelopes', () => {
    expect(
      CodeforcesProblemsetResponseSchema.safeParse({ status: 'OK' }).success,
    ).toBe(false)
    expect(
      CodeforcesProblemsetResponseSchema.safeParse({
        status: 'FAILED',
        comment: '  ',
      }).success,
    ).toBe(false)
  })

  it('lets the adapter inspect records individually after envelope validation', () => {
    const result = CodeforcesProblemsetEnvelopeSchema.parse({
      status: 'OK',
      result: {
        problems: [problem, { invalid: true }],
        problemStatistics: [{ invalid: true }],
      },
    })

    expect(result.status).toBe('OK')
  })
})

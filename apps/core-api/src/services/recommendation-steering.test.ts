import { describe, expect, it } from 'vitest'

import {
  mergeSteering,
  parseRecommendationSteering,
} from './recommendation-steering.js'

const band = { min: 1400, max: 1700 }
const parse = (text: string, feedProblems = [] as const) =>
  parseRecommendationSteering(text, { currentBand: band, feedProblems })

describe('parseRecommendationSteering', () => {
  it('reads exclusions and focus in one sentence', () => {
    const { directives, applied } = parse(
      "I don't want LeetCode questions and want more DP around 1600",
    )
    expect(directives.excludeProviders).toEqual(['leetcode'])
    expect(directives.includeTopics).toEqual(['dynamic-programming'])
    expect(directives.ratingRange).toEqual({ min: 1500, max: 1700 })
    expect(applied).toContain('No LeetCode problems')
    expect(applied).toContain('Focus on Dynamic Programming')
  })

  it('reads only-provider and topic restrictions', () => {
    const { directives } = parse('only codeforces, only graphs please')
    expect(directives.onlyProviders).toEqual(['codeforces'])
    expect(directives.includeTopics).toEqual(['graphs'])
    expect(directives.onlyTopics).toBe(true)
  })

  it('does not read a longer topic as its shorter part', () => {
    const { directives } = parse('no segment tree problems')
    expect(directives.excludeTopics).toEqual(['segment-trees'])
  })

  it('handles "no more" and "not interested in"', () => {
    expect(parse('no more codechef').directives.excludeProviders).toEqual([
      'codechef',
    ])
    expect(
      parse(
        'not interested in geometry or number theory',
      ).directives.excludeTopics.sort(),
    ).toEqual(['geometry', 'number-theory'])
  })

  it('reads explicit and relative rating ranges', () => {
    expect(parse('between 1200 and 1500').directives.ratingRange).toEqual({
      min: 1200,
      max: 1500,
    })
    expect(parse('1800-1600 rated').directives.ratingRange).toEqual({
      min: 1600,
      max: 1800,
    })
    expect(parse('these are too easy').directives.ratingRange).toEqual({
      min: 1600,
      max: 1900,
    })
    expect(parse('make them easier').directives.ratingRange).toEqual({
      min: 1200,
      max: 1500,
    })
    expect(parse('under 1300').directives.ratingRange).toEqual({
      min: 900,
      max: 1300,
    })
  })

  it('does not read a problem id as a rating', () => {
    expect(parse('skip 2266C').directives.ratingRange).toBeUndefined()
  })

  it('removes specific problems from the current feed by title', () => {
    const { directives, applied } = parseRecommendationSteering(
      "I don't want Sereja and Brackets",
      {
        currentBand: band,
        feedProblems: [
          {
            provider: 'codeforces',
            externalId: '380C',
            title: 'Sereja and Brackets',
          },
          { provider: 'codeforces', externalId: '1A', title: 'Theatre Square' },
        ],
      },
    )
    expect(directives.excludeProblems).toEqual([
      {
        provider: 'codeforces',
        externalId: '380C',
        title: 'Sereja and Brackets',
      },
    ])
    expect(applied).toContain('Removed “Sereja and Brackets”')
  })

  it('keeps unparseable text as a note without directives', () => {
    const { applied } = parse('I learn best from classic problems')
    expect(applied).toEqual([])
  })
})

describe('mergeSteering', () => {
  it('lets a newer instruction override an older one', () => {
    const older = parse('no leetcode, no dp').directives
    const newer = parse('leetcode is fine now, more dp').directives
    const merged = mergeSteering([
      { text: 'b', directives: newer, createdAt: new Date('2026-09-02') },
      { text: 'a', directives: older, createdAt: new Date('2026-09-01') },
    ])
    expect(merged.excludeProviders).toEqual([])
    expect(merged.preferProviders).toEqual(['leetcode'])
    expect(merged.includeTopics).toEqual(['dynamic-programming'])
    expect(merged.excludeTopics).toEqual([])
    expect(merged.notes).toEqual(['a', 'b'])
  })

  it('replaces an older only-provider rule', () => {
    const merged = mergeSteering([
      {
        text: 'a',
        directives: parse('only leetcode').directives,
        createdAt: new Date('2026-09-01'),
      },
      {
        text: 'b',
        directives: parse('only codeforces').directives,
        createdAt: new Date('2026-09-02'),
      },
    ])
    expect(merged.onlyProviders).toEqual(['codeforces'])
  })
})

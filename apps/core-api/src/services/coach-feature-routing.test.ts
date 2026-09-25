import { describe, expect, it } from 'vitest'

import {
  coachFeatureRedirect,
  routeCoachFeature,
} from './coach-feature-routing.js'

const url = 'https://codeforces.com/problemset/problem/2266/G'

describe('coach feature routing', () => {
  it.each([
    [`help me with ${url}`, 'doubt_helper'],
    [`give me a hint for ${url}`, 'doubt_helper'],
    ['My code gets wrong answer on test 3', 'doubt_helper'],
    ['I keep getting TLE, can you debug it?', 'doubt_helper'],
    ["I'm stuck on this problem", 'doubt_helper'],
    [`show me different approaches for ${url}`, 'solution_explorer'],
    ['Is there an editorial for this problem?', 'solution_explorer'],
    ['What should I upsolve from last week?', 'upsolve'],
    ['Analyze my recent contests', 'contest_analysis'],
    ['Why did my rating drop yesterday?', 'contest_analysis'],
    ['How am I progressing this month?', 'progress_report'],
  ])('routes %j to %s', (message, feature) => {
    expect(routeCoachFeature(message)?.feature).toBe(feature)
  })

  it.each([
    'Explain binary search with an example',
    'What is the difference between BFS and DFS?',
    'What should I practice next?',
    'What is the roadmap to learn dynamic programming?',
    'Update my study plan please',
    'Open my learning path',
    'hello',
  ])('keeps %j in the chat', (message) => {
    expect(routeCoachFeature(message)).toBeNull()
  })

  it('carries a problem link only to problem-specific sections', () => {
    const route = routeCoachFeature(`hint please ${url}`)
    expect(route).toEqual({ feature: 'doubt_helper', problemUrl: url })
    const redirect = coachFeatureRedirect(route ?? { feature: 'upsolve' })
    expect(redirect.block).toMatchObject({
      type: 'feature_redirect',
      feature: 'doubt_helper',
      problemUrl: url,
    })
    expect(redirect.answer).toContain('carried your problem link')
    expect(
      coachFeatureRedirect({ feature: 'upsolve', problemUrl: url }).block,
    ).not.toHaveProperty('problemUrl')
  })
})

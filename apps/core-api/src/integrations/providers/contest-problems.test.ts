import { describe, expect, it } from 'vitest'

import {
  CodeChefContestSchema,
  codeChefContestCode,
  codeChefContestProblems,
  codeChefDivisionOrder,
  leetcodeContestProblems,
  leetcodeContestSlug,
} from './contest-problems.js'

describe('contest problem lists', () => {
  it('reads contest codes only from reviewed hosts', () => {
    expect(codeChefContestCode('https://www.codechef.com/START257')).toBe(
      'START257',
    )
    expect(codeChefContestCode('https://evil.example/START257')).toBeUndefined()
    expect(
      leetcodeContestSlug('https://leetcode.com/contest/weekly-contest-518/'),
    ).toBe('weekly-contest-518')
  })

  it('orders scored CodeChef problems by solves and skips unscored ones', () => {
    const contest = CodeChefContestSchema.parse({
      problems: {
        HARD: {
          code: 'HARD',
          name: 'Hard',
          category_name: 'main',
          successful_submissions: '12',
        },
        EASY: {
          code: 'EASY',
          name: 'Easy',
          category_name: 'main',
          successful_submissions: '900',
        },
        PRAC: {
          code: 'PRAC',
          name: 'Practice',
          category_name: 'unscored',
          successful_submissions: '5000',
        },
      },
    })
    expect(
      codeChefContestProblems(contest).map((item) => [
        item.position,
        item.problemKey,
        item.canonicalUrl,
      ]),
    ).toEqual([
      ['P1', 'EASY', 'https://www.codechef.com/problems/EASY'],
      ['P2', 'HARD', 'https://www.codechef.com/problems/HARD'],
    ])
  })

  it('tries the rating-matched CodeChef division first', () => {
    const contest = CodeChefContestSchema.parse({
      child_contests: {
        div_1: {
          contest_code: 'START1A',
          div: { min_rating: 2000, max_rating: 50000 },
        },
        div_3: {
          contest_code: 'START1C',
          div: { min_rating: 1400, max_rating: 1599 },
        },
      },
    })
    expect(
      codeChefDivisionOrder(contest, { submittedKeys: [], rating: 1500 })[0],
    ).toBe('START1C')
  })

  it('labels LeetCode contest questions Q1 to Q4', () => {
    const problems = leetcodeContestProblems({
      data: {
        contestQuestionList: [
          { title: 'Two Sum', titleSlug: 'two-sum', credit: 3 },
          { title: 'Paths', titleSlug: 'paths', credit: 4 },
        ],
      },
    })
    expect(problems.map((item) => [item.position, item.canonicalUrl])).toEqual([
      ['Q1', 'https://leetcode.com/problems/two-sum/'],
      ['Q2', 'https://leetcode.com/problems/paths/'],
    ])
  })
})

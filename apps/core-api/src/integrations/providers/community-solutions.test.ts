import { describe, expect, it } from 'vitest'

import {
  codeforcesCommunitySolutions,
  languageFamily,
  leetcodeCommunitySolutions,
  leetcodeLanguageTag,
} from './community-solutions.js'

const submission = (
  id: number,
  index: string,
  language: string,
  time: number,
  handle: string,
  verdict = 'OK',
) => ({
  id,
  contestId: 2266,
  problem: { index },
  programmingLanguage: language,
  verdict,
  timeConsumedMillis: time,
  memoryConsumedBytes: 1_048_576,
  author: { members: [{ handle }] },
})

describe('community solutions', () => {
  it('groups compiler names into language families', () => {
    expect(languageFamily('C++17 (GCC 7-32)')).toBe('cpp')
    expect(languageFamily('C++')).toBe('cpp')
    expect(languageFamily('Java 21')).toBe('java')
    expect(languageFamily('JavaScript V8')).toBe('other')
    expect(languageFamily('PyPy 3-64')).toBe('python')
    expect(leetcodeLanguageTag('Python')).toBe('python3')
    expect(leetcodeLanguageTag('Rust')).toBeUndefined()
  })

  it('picks the fastest accepted Codeforces submissions, one per author', () => {
    const links = codeforcesCommunitySolutions(
      [
        submission(1, 'D', 'C++17 (GCC 7-32)', 200, 'a'),
        submission(2, 'D', 'C++20 (GCC 13-64)', 46, 'b'),
        submission(3, 'D', 'C++20 (GCC 13-64)', 31, 'b'),
        submission(4, 'D', 'Python 3', 10, 'c'),
        submission(5, 'C', 'C++17 (GCC 7-32)', 5, 'd'),
        submission(6, 'D', 'C++17 (GCC 7-32)', 1, 'e', 'WRONG_ANSWER'),
        { malformed: true },
        submission(7, 'D', 'C++17 (GCC 7-32)', 90, 'f'),
      ],
      2266,
      'D',
      'C++',
    )
    expect(links.map((link) => link.url)).toEqual([
      'https://codeforces.com/contest/2266/submission/3',
      'https://codeforces.com/contest/2266/submission/7',
      'https://codeforces.com/contest/2266/submission/1',
    ])
    expect(links[0]?.title).toBe(
      "b's accepted C++20 (GCC 13-64) solution · 31 ms",
    )
  })

  it('links the most-voted LeetCode solutions for the language', () => {
    const links = leetcodeCommunitySolutions(
      {
        data: {
          ugcArticleSolutionArticles: {
            edges: [
              {
                node: {
                  title: '3 Methods || C++',
                  slug: '3-methods-c',
                  topicId: 3619262,
                  reactions: [{ count: 12166, reactionType: 'UPVOTE' }],
                },
              },
            ],
          },
        },
      },
      'two-sum',
      'C++',
    )
    expect(links).toEqual([
      {
        title: '3 Methods || C++',
        url: 'https://leetcode.com/problems/two-sum/solutions/3619262/3-methods-c/',
        publisher: 'LeetCode',
        language: 'C++',
        note: '12,166 upvotes.',
      },
    ])
  })
})

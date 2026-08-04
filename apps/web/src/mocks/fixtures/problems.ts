import { ProblemDetailSchema } from '@algomemtor/shared-contracts'

import { topicFixtures } from './topics'

const canonicalTopicSlugs = new Set(topicFixtures.map((topic) => topic.slug))
const urlSafeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const ProblemFixturesSchema = ProblemDetailSchema.array()
  .min(20)
  .max(30)
  .superRefine((problems, context) => {
    const ids = new Set<string>()
    const slugs = new Set<string>()
    const usedTopicSlugs = new Set<string>()

    problems.forEach((problem, index) => {
      if (ids.has(problem.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate problem ID: ${problem.id}`,
          path: [index, 'id'],
        })
      }

      if (slugs.has(problem.slug)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate problem slug: ${problem.slug}`,
          path: [index, 'slug'],
        })
      }

      if (!urlSafeSlugPattern.test(problem.slug)) {
        context.addIssue({
          code: 'custom',
          message: `Problem slug is not URL-safe: ${problem.slug}`,
          path: [index, 'slug'],
        })
      }

      if (problem.topics.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A problem must have at least one topic.',
          path: [index, 'topics'],
        })
      }

      if (problem.constraints.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A problem must have at least one constraint.',
          path: [index, 'constraints'],
        })
      }

      if (problem.examples.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A problem must have at least one example.',
          path: [index, 'examples'],
        })
      }

      problem.topics.forEach((topic, topicIndex) => {
        if (!canonicalTopicSlugs.has(topic)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown topic slug: ${topic}`,
            path: [index, 'topics', topicIndex],
          })
        }

        usedTopicSlugs.add(topic)
      })

      ids.add(problem.id)
      slugs.add(problem.slug)
    })

    canonicalTopicSlugs.forEach((topic) => {
      if (!usedTopicSlugs.has(topic)) {
        context.addIssue({
          code: 'custom',
          message: `Fixture collection does not cover topic: ${topic}`,
          path: [],
        })
      }
    })
  })

export const problemFixtures = ProblemFixturesSchema.parse([
  {
    id: 'problem_001',
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    topics: ['arrays', 'hashing'],
    status: 'solved',
    acceptanceRate: 51.4,
    statement:
      'Find the two positions in an integer array whose values add up to a given target.',
    constraints: ['2 <= nums.length <= 10^4', 'Exactly one valid pair exists.'],
    examples: [
      {
        input: 'nums = [2, 7, 11, 15], target = 9',
        output: '[0, 1]',
        explanation: 'The values 2 and 7 add up to 9.',
      },
    ],
  },
  {
    id: 'problem_002',
    slug: 'best-stock-trade',
    title: 'Best Stock Trade',
    difficulty: 'easy',
    topics: ['arrays'],
    status: 'not_started',
    acceptanceRate: 55.8,
    statement:
      'Choose one day to buy and a later day to sell so that the resulting profit is as large as possible.',
    constraints: ['1 <= prices.length <= 10^5', '0 <= prices[i] <= 10^4'],
    examples: [
      {
        input: 'prices = [7, 1, 5, 3, 6, 4]',
        output: '5',
        explanation: 'Buying at 1 and selling at 6 earns a profit of 5.',
      },
    ],
  },
  {
    id: 'problem_003',
    slug: 'remove-sorted-duplicates',
    title: 'Remove Sorted Duplicates',
    difficulty: 'easy',
    topics: ['arrays', 'two-pointers'],
    status: 'attempted',
    acceptanceRate: 58.6,
    statement:
      'Compact a sorted array in place so that each distinct value appears once at the beginning.',
    constraints: [
      '1 <= nums.length <= 3 * 10^4',
      'nums is sorted in ascending order.',
    ],
    examples: [
      {
        input: 'nums = [1, 1, 2, 2, 3]',
        output: 'length = 3, prefix = [1, 2, 3]',
      },
    ],
  },
  {
    id: 'problem_004',
    slug: 'valid-anagram',
    title: 'Valid Anagram',
    difficulty: 'easy',
    topics: ['strings', 'hashing'],
    status: 'solved',
    acceptanceRate: 63.1,
    statement:
      'Determine whether two lowercase strings contain exactly the same letters with the same frequencies.',
    constraints: [
      '1 <= s.length, t.length <= 5 * 10^4',
      'Both strings contain lowercase English letters.',
    ],
    examples: [
      {
        input: "s = 'listen', t = 'silent'",
        output: 'true',
      },
    ],
  },
  {
    id: 'problem_005',
    slug: 'longest-unique-substring',
    title: 'Longest Unique Substring',
    difficulty: 'medium',
    topics: ['strings', 'hashing', 'two-pointers'],
    status: 'attempted',
    acceptanceRate: 36.9,
    statement:
      'Return the length of the longest contiguous part of a string that contains no repeated character.',
    constraints: [
      '0 <= s.length <= 5 * 10^4',
      'The string may contain letters, digits, spaces, and symbols.',
    ],
    examples: [
      {
        input: "s = 'abcabcbb'",
        output: '3',
        explanation: "One longest valid substring is 'abc'.",
      },
    ],
  },
  {
    id: 'problem_006',
    slug: 'palindrome-phrase',
    title: 'Palindrome Phrase',
    difficulty: 'easy',
    topics: ['strings', 'two-pointers'],
    status: 'not_started',
    acceptanceRate: 49.7,
    statement:
      'Check whether a phrase reads the same in both directions after ignoring punctuation, spaces, and letter case.',
    constraints: [
      '1 <= phrase.length <= 2 * 10^5',
      'Only letters and digits participate in the comparison.',
    ],
    examples: [
      {
        input: "phrase = 'Never odd or even'",
        output: 'true',
      },
    ],
  },
  {
    id: 'problem_007',
    slug: 'find-in-sorted-array',
    title: 'Find in Sorted Array',
    difficulty: 'easy',
    topics: ['arrays', 'binary-search'],
    status: 'solved',
    acceptanceRate: 57.2,
    statement:
      'Find a target value in a sorted integer array and return its index, or return -1 when it is absent.',
    constraints: [
      '1 <= nums.length <= 10^5',
      'All values are distinct and sorted in ascending order.',
    ],
    examples: [
      {
        input: 'nums = [-1, 0, 3, 5, 9, 12], target = 9',
        output: '4',
      },
    ],
  },
  {
    id: 'problem_008',
    slug: 'search-rotated-array',
    title: 'Search a Rotated Array',
    difficulty: 'medium',
    topics: ['arrays', 'binary-search'],
    status: 'attempted',
    acceptanceRate: 41.3,
    statement:
      'Locate a target in a sorted array that was rotated once around an unknown pivot.',
    constraints: [
      '1 <= nums.length <= 5 * 10^4',
      'All array values are unique.',
    ],
    examples: [
      {
        input: 'nums = [4, 5, 6, 7, 0, 1, 2], target = 0',
        output: '4',
      },
    ],
  },
  {
    id: 'problem_009',
    slug: 'integer-square-root',
    title: 'Integer Square Root',
    difficulty: 'easy',
    topics: ['binary-search'],
    status: 'not_started',
    acceptanceRate: 39.8,
    statement:
      'Compute the greatest non-negative integer whose square does not exceed the given number.',
    constraints: [
      '0 <= value <= 2^31 - 1',
      'Do not use a built-in square-root operation.',
    ],
    examples: [
      {
        input: 'value = 17',
        output: '4',
        explanation: 'Five squared is too large, so the integer result is 4.',
      },
    ],
  },
  {
    id: 'problem_010',
    slug: 'memoized-fibonacci',
    title: 'Memoized Fibonacci',
    difficulty: 'easy',
    topics: ['recursion'],
    status: 'solved',
    acceptanceRate: 72.5,
    statement:
      'Calculate the nth Fibonacci number with a recursive solution that avoids repeating completed work.',
    constraints: ['0 <= n <= 45', 'Use memoization with the recursive calls.'],
    examples: [
      {
        input: 'n = 8',
        output: '21',
      },
    ],
  },
  {
    id: 'problem_011',
    slug: 'balanced-parenthesis-combinations',
    title: 'Balanced Parenthesis Combinations',
    difficulty: 'medium',
    topics: ['recursion', 'strings'],
    status: 'not_started',
    acceptanceRate: 68.4,
    statement:
      'Generate every well-formed parenthesis string that can be built from a given number of pairs.',
    constraints: [
      '1 <= pairs <= 8',
      'Return each valid combination exactly once.',
    ],
    examples: [
      {
        input: 'pairs = 2',
        output: "['(())', '()()']",
      },
    ],
  },
  {
    id: 'problem_012',
    slug: 'reverse-linked-list',
    title: 'Reverse a Linked List',
    difficulty: 'easy',
    topics: ['linked-lists'],
    status: 'solved',
    acceptanceRate: 76.3,
    statement:
      'Reverse the links in a singly linked list and return the node that becomes the new head.',
    constraints: [
      '0 <= node count <= 5 * 10^4',
      'Each node stores an integer value.',
    ],
    examples: [
      {
        input: 'head = 1 -> 2 -> 3 -> null',
        output: '3 -> 2 -> 1 -> null',
      },
    ],
  },
  {
    id: 'problem_013',
    slug: 'merge-sorted-linked-lists',
    title: 'Merge Sorted Linked Lists',
    difficulty: 'easy',
    topics: ['linked-lists'],
    status: 'attempted',
    acceptanceRate: 64.7,
    statement:
      'Combine two sorted singly linked lists into one sorted list by reusing their nodes.',
    constraints: [
      '0 <= node count per list <= 50',
      'Both input lists are sorted in ascending order.',
    ],
    examples: [
      {
        input: 'first = 1 -> 3 -> 5, second = 2 -> 4 -> 6',
        output: '1 -> 2 -> 3 -> 4 -> 5 -> 6',
      },
    ],
  },
  {
    id: 'problem_014',
    slug: 'linked-list-cycle',
    title: 'Linked List Cycle',
    difficulty: 'medium',
    topics: ['linked-lists', 'two-pointers'],
    status: 'not_started',
    acceptanceRate: 50.9,
    statement:
      'Determine whether following next pointers in a singly linked list eventually visits a node twice.',
    constraints: ['0 <= node count <= 10^4', 'Do not modify the list.'],
    examples: [
      {
        input: 'values = [3, 2, 0, -4], tail connects to index 1',
        output: 'true',
      },
    ],
  },
  {
    id: 'problem_015',
    slug: 'valid-brackets',
    title: 'Valid Brackets',
    difficulty: 'easy',
    topics: ['strings', 'stacks'],
    status: 'solved',
    acceptanceRate: 42.6,
    statement:
      'Check whether every opening bracket in a string is closed by the correct bracket in the correct order.',
    constraints: [
      '1 <= expression.length <= 10^4',
      'The input contains only (), [], and {} characters.',
    ],
    examples: [
      {
        input: "expression = '([]{})'",
        output: 'true',
      },
    ],
  },
  {
    id: 'problem_016',
    slug: 'next-greater-value',
    title: 'Next Greater Value',
    difficulty: 'medium',
    topics: ['arrays', 'stacks'],
    status: 'attempted',
    acceptanceRate: 54.1,
    statement:
      'For every array position, find the first larger value to its right, or -1 when none exists.',
    constraints: ['1 <= nums.length <= 10^5', '-10^9 <= nums[i] <= 10^9'],
    examples: [
      {
        input: 'nums = [2, 1, 2, 4, 3]',
        output: '[4, 2, 4, -1, -1]',
      },
    ],
  },
  {
    id: 'problem_017',
    slug: 'queue-with-two-stacks',
    title: 'Queue with Two Stacks',
    difficulty: 'easy',
    topics: ['stacks', 'queues'],
    status: 'not_started',
    acceptanceRate: 66.2,
    statement:
      'Implement first-in-first-out queue operations using only two last-in-first-out stacks.',
    constraints: [
      'At most 10^4 operations are performed.',
      'Pop and peek are called only when the queue is non-empty.',
    ],
    examples: [
      {
        input: 'push(4), push(7), peek(), pop(), empty()',
        output: '[4, 4, false]',
      },
    ],
  },
  {
    id: 'problem_018',
    slug: 'sliding-window-maximum',
    title: 'Sliding Window Maximum',
    difficulty: 'hard',
    topics: ['arrays', 'queues'],
    status: 'not_started',
    acceptanceRate: 47.5,
    statement:
      'Report the maximum value in every contiguous window of a fixed size as the window moves across an array.',
    constraints: [
      '1 <= windowSize <= nums.length <= 10^5',
      '-10^4 <= nums[i] <= 10^4',
    ],
    examples: [
      {
        input: 'nums = [1, 3, -1, -3, 5, 3, 6, 7], windowSize = 3',
        output: '[3, 3, 5, 5, 6, 7]',
      },
    ],
  },
  {
    id: 'problem_019',
    slug: 'maximum-tree-depth',
    title: 'Maximum Tree Depth',
    difficulty: 'easy',
    topics: ['trees', 'recursion'],
    status: 'solved',
    acceptanceRate: 74.9,
    statement:
      'Find the number of nodes on the longest path from the root of a binary tree to a leaf.',
    constraints: ['0 <= node count <= 10^4', '-100 <= node.value <= 100'],
    examples: [
      {
        input: 'levelOrder = [3, 9, 20, null, null, 15, 7]',
        output: '3',
      },
    ],
  },
  {
    id: 'problem_020',
    slug: 'binary-tree-level-order',
    title: 'Binary Tree Level Order',
    difficulty: 'medium',
    topics: ['trees', 'queues'],
    status: 'attempted',
    acceptanceRate: 67.3,
    statement:
      'Return the values of a binary tree grouped by depth from the root downward.',
    constraints: ['0 <= node count <= 2 * 10^3', '-1000 <= node.value <= 1000'],
    examples: [
      {
        input: 'levelOrder = [3, 9, 20, null, null, 15, 7]',
        output: '[[3], [9, 20], [15, 7]]',
      },
    ],
  },
  {
    id: 'problem_021',
    slug: 'validate-binary-search-tree',
    title: 'Validate a Binary Search Tree',
    difficulty: 'medium',
    topics: ['trees', 'recursion'],
    status: 'not_started',
    acceptanceRate: 34.6,
    statement:
      'Determine whether every node in a binary tree obeys the ordering rules of a binary search tree.',
    constraints: [
      '1 <= node count <= 10^4',
      'Node values fit in a signed 32-bit integer.',
    ],
    examples: [
      {
        input: 'levelOrder = [2, 1, 3]',
        output: 'true',
      },
    ],
  },
  {
    id: 'problem_022',
    slug: 'count-graph-components',
    title: 'Count Graph Components',
    difficulty: 'medium',
    topics: ['graphs', 'recursion'],
    status: 'solved',
    acceptanceRate: 61.8,
    statement:
      'Count the disconnected groups of vertices in an undirected graph.',
    constraints: [
      '1 <= vertexCount <= 2000',
      'No edge connects a vertex to itself.',
    ],
    examples: [
      {
        input: 'vertexCount = 5, edges = [[0, 1], [1, 2], [3, 4]]',
        output: '2',
      },
    ],
  },
  {
    id: 'problem_023',
    slug: 'shortest-unweighted-path',
    title: 'Shortest Unweighted Path',
    difficulty: 'medium',
    topics: ['graphs', 'queues'],
    status: 'attempted',
    acceptanceRate: 59.4,
    statement:
      'Find the minimum number of edges needed to travel between two vertices in an unweighted graph.',
    constraints: [
      '2 <= vertexCount <= 10^4',
      'A path between the start and destination is guaranteed.',
    ],
    examples: [
      {
        input: 'edges = [[0, 1], [1, 2], [0, 3], [3, 2]], start = 0, end = 2',
        output: '2',
      },
    ],
  },
  {
    id: 'problem_024',
    slug: 'course-ordering',
    title: 'Course Ordering',
    difficulty: 'medium',
    topics: ['graphs', 'queues'],
    status: 'attempted',
    acceptanceRate: 46.2,
    statement:
      'Produce an order for completing courses from their prerequisites, or report that no valid order exists.',
    constraints: [
      '1 <= courseCount <= 2000',
      'Each prerequisite pair contains two different courses.',
    ],
    examples: [
      {
        input:
          'courseCount = 4, prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]',
        output: '[0, 1, 2, 3]',
        explanation:
          'Other orders that respect every prerequisite are also valid.',
      },
    ],
  },
  {
    id: 'problem_025',
    slug: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    difficulty: 'hard',
    topics: ['arrays', 'two-pointers'],
    status: 'solved',
    acceptanceRate: 62.7,
    statement:
      'Calculate how many units of water remain between bars after rain falls on an elevation map.',
    constraints: ['1 <= heights.length <= 2 * 10^4', '0 <= heights[i] <= 10^5'],
    examples: [
      {
        input: 'heights = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]',
        output: '6',
      },
    ],
  },
])

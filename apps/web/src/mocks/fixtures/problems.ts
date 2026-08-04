import { ExternalProblemSummarySchema } from '@algomemtor/shared-contracts'

import { topicFixtures } from './topics'

const canonicalTopicSlugs = new Set(topicFixtures.map((topic) => topic.slug))

const ExternalProblemFixturesSchema = ExternalProblemSummarySchema.array()
  .min(20)
  .max(30)
  .superRefine((problems, context) => {
    const identities = new Set<string>()

    problems.forEach((problem, index) => {
      const identity = `${problem.provider}:${problem.externalId}`

      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate external problem identity: ${identity}`,
          path: [index, 'externalId'],
        })
      }

      const url = new URL(problem.canonicalUrl)

      if (
        problem.provider === 'codeforces' &&
        url.hostname !== 'codeforces.com'
      ) {
        context.addIssue({
          code: 'custom',
          message: 'A Codeforces fixture must use the codeforces.com host.',
          path: [index, 'canonicalUrl'],
        })
      }

      problem.topics.forEach((topic, topicIndex) => {
        if (!canonicalTopicSlugs.has(topic)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown normalized topic slug: ${topic}`,
            path: [index, 'topics', topicIndex],
          })
        }
      })

      identities.add(identity)
    })
  })

const fetchedAt = '2026-08-05T00:00:00.000Z'

export const problemFixtures = ExternalProblemFixturesSchema.parse([
  {
    provider: 'codeforces',
    externalId: '4A',
    title: 'Watermelon',
    canonicalUrl: 'https://codeforces.com/problemset/problem/4/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['brute force', 'math'],
    topics: ['arrays'],
    fetchedAt,
    learnerStatus: 'solved_verified',
  },
  {
    provider: 'codeforces',
    externalId: '71A',
    title: 'Way Too Long Words',
    canonicalUrl: 'https://codeforces.com/problemset/problem/71/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['strings'],
    topics: ['strings'],
    fetchedAt,
    learnerStatus: 'completed_manual',
  },
  {
    provider: 'codeforces',
    externalId: '158A',
    title: 'Next Round',
    canonicalUrl: 'https://codeforces.com/problemset/problem/158/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['special problem', 'implementation'],
    topics: ['arrays'],
    fetchedAt,
    learnerStatus: 'opened',
  },
  {
    provider: 'codeforces',
    externalId: '231A',
    title: 'Team',
    canonicalUrl: 'https://codeforces.com/problemset/problem/231/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['brute force', 'greedy'],
    topics: ['arrays'],
    fetchedAt,
    learnerStatus: 'recommended',
  },
  {
    provider: 'codeforces',
    externalId: '282A',
    title: 'Bit++',
    canonicalUrl: 'https://codeforces.com/problemset/problem/282/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '263A',
    title: 'Beautiful Matrix',
    canonicalUrl: 'https://codeforces.com/problemset/problem/263/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '50A',
    title: 'Domino Piling',
    canonicalUrl: 'https://codeforces.com/problemset/problem/50/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['greedy', 'math'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '112A',
    title: 'Petya and Strings',
    canonicalUrl: 'https://codeforces.com/problemset/problem/112/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation', 'strings'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '339A',
    title: 'Helpful Maths',
    canonicalUrl: 'https://codeforces.com/problemset/problem/339/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['greedy', 'implementation', 'sortings', 'strings'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '281A',
    title: 'Word Capitalization',
    canonicalUrl: 'https://codeforces.com/problemset/problem/281/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation', 'strings'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '236A',
    title: 'Boy or Girl',
    canonicalUrl: 'https://codeforces.com/problemset/problem/236/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['brute force', 'implementation', 'strings'],
    topics: ['strings', 'hashing'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '546A',
    title: 'Soldier and Bananas',
    canonicalUrl: 'https://codeforces.com/problemset/problem/546/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['brute force', 'implementation', 'math'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '791A',
    title: 'Bear and Big Brother',
    canonicalUrl: 'https://codeforces.com/problemset/problem/791/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['recursion'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '977A',
    title: 'Wrong Subtraction',
    canonicalUrl: 'https://codeforces.com/problemset/problem/977/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['recursion'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '734A',
    title: 'Anton and Danik',
    canonicalUrl: 'https://codeforces.com/problemset/problem/734/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation', 'strings'],
    topics: ['strings', 'hashing'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '116A',
    title: 'Tram',
    canonicalUrl: 'https://codeforces.com/problemset/problem/116/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '266A',
    title: 'Stones on the Table',
    canonicalUrl: 'https://codeforces.com/problemset/problem/266/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation'],
    topics: ['strings', 'two-pointers'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '617A',
    title: 'Elephant',
    canonicalUrl: 'https://codeforces.com/problemset/problem/617/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['math'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '59A',
    title: 'Word',
    canonicalUrl: 'https://codeforces.com/problemset/problem/59/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['implementation', 'strings'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '110A',
    title: 'Nearly Lucky Number',
    canonicalUrl: 'https://codeforces.com/problemset/problem/110/A',
    providerDifficulty: 800,
    normalizedDifficulty: 'easy',
    providerTags: ['brute force'],
    topics: ['strings'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '96A',
    title: 'Football',
    canonicalUrl: 'https://codeforces.com/problemset/problem/96/A',
    providerDifficulty: 900,
    normalizedDifficulty: 'medium',
    providerTags: ['implementation', 'strings'],
    topics: ['strings', 'two-pointers'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '160A',
    title: 'Twins',
    canonicalUrl: 'https://codeforces.com/problemset/problem/160/A',
    providerDifficulty: 900,
    normalizedDifficulty: 'medium',
    providerTags: ['greedy', 'sortings'],
    topics: ['arrays'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '118A',
    title: 'String Task',
    canonicalUrl: 'https://codeforces.com/problemset/problem/118/A',
    providerDifficulty: 1000,
    normalizedDifficulty: 'medium',
    providerTags: ['implementation', 'strings'],
    topics: ['strings', 'two-pointers'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '474B',
    title: 'Worms',
    canonicalUrl: 'https://codeforces.com/problemset/problem/474/B',
    providerDifficulty: 1200,
    normalizedDifficulty: 'medium',
    providerTags: ['binary search', 'implementation'],
    topics: ['arrays', 'binary-search'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '500A',
    title: 'New Year Transportation',
    canonicalUrl: 'https://codeforces.com/problemset/problem/500/A',
    providerDifficulty: 1000,
    normalizedDifficulty: 'medium',
    providerTags: ['dfs and similar', 'graphs', 'implementation'],
    topics: ['graphs'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '115A',
    title: 'Party',
    canonicalUrl: 'https://codeforces.com/problemset/problem/115/A',
    providerDifficulty: 1000,
    normalizedDifficulty: 'medium',
    providerTags: ['dfs and similar', 'graphs', 'trees'],
    topics: ['graphs', 'trees'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '343B',
    title: 'Alternating Current',
    canonicalUrl: 'https://codeforces.com/problemset/problem/343/B',
    providerDifficulty: 1200,
    normalizedDifficulty: 'medium',
    providerTags: ['data structures', 'implementation'],
    topics: ['strings', 'stacks'],
    fetchedAt,
  },
  {
    provider: 'codeforces',
    externalId: '20C',
    title: 'Dijkstra?',
    canonicalUrl: 'https://codeforces.com/problemset/problem/20/C',
    providerDifficulty: 1900,
    normalizedDifficulty: 'hard',
    providerTags: ['graphs', 'shortest paths'],
    topics: ['graphs', 'queues'],
    fetchedAt,
  },
])

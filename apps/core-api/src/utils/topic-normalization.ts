// Provider tags and CSES problem-set section names (the browser connector
// stores each CSES task's section) mapped to broad learning areas. Mixed
// sections such as "Additional Problems" and "Advanced Techniques" stay
// unmapped rather than guessed.
const topicGroups = {
  Arrays: [
    'array',
    'arrays',
    'matrix',
    'matrices',
    'prefix sum',
    'prefix sums',
    'difference array',
  ],
  Hashing: [
    'hashing',
    'hash table',
    'hash function',
    'rolling hash',
    'array and hashing',
  ],
  'Sliding Window': ['sliding window', 'sliding window problems'],
  Math: [
    'math',
    'mathematics',
    'combinatorics',
    'geometry',
    'probability',
    'probabilities',
    'probability and statistics',
    'fft',
    'counting',
    'counting problems',
    'line sweep',
  ],
  'Number Theory': ['number theory', 'chinese remainder theorem'],
  Sorting: [
    'sorting',
    'sortings',
    'quickselect',
    'merge sort',
    'bucket sort',
    'radix sort',
    'counting sort',
    'sorting and searching',
  ],
  'Binary Search': ['binary search', 'binarysearch', 'ternary search'],
  'Two Pointers': ['two pointers', 'two pointer'],
  Greedy: ['greedy'],
  Strings: [
    'string',
    'strings',
    'string matching',
    'string suffix structures',
    'trie',
    'tries',
    'string algorithms',
  ],
  Trees: [
    'tree',
    'trees',
    'binary tree',
    'binary search tree',
    'tree algorithms',
  ],
  Graphs: [
    'graph',
    'graphs',
    'graph theory',
    'graph algorithms',
    'advanced graph problems',
    'graph matchings',
    '2 sat',
    'bfs',
    'dfs',
    'bfs dfs',
    'bfs and dfs',
    'breadth first search',
    'depth first search',
    'dfs and similar',
    'disjoint set union',
    'disjoint set',
    'dsu',
    'union find',
    'shortest path',
    'shortest paths',
    'minimum spanning tree',
    'minimum spanning trees',
    'topological sort',
    'topological sorting',
    'network flow',
    'flows',
    'strongly connected component',
    'biconnected component',
    'euler tour',
    'eulerian circuit',
  ],
  'Dynamic Programming': [
    'dynamic programming',
    'advanced dynamic programming',
    'dp',
    'memoization',
  ],
  'Bit Manipulation': [
    'bit manipulation',
    'bitmask',
    'bitmasks',
    'bitwise operations',
  ],
  Implementation: ['implementation', 'simulation', 'introductory problems'],
  'Brute Force': ['brute force', 'enumeration'],
  Constructive: [
    'constructive',
    'constructive algorithms',
    'construction problems',
  ],
  'Data Structures': [
    'data structure',
    'data structures',
    'linked list',
    'linked lists',
    'doubly linked list',
    'stack',
    'stacks',
    'queue',
    'queues',
    'stacks and queues',
    'monotonic stack',
    'monotonic queue',
    'heap',
    'heap priority queue',
    'heaps and priority queues',
    'priority queue',
    'segment tree',
    'segment trees',
    'fenwick tree',
    'fenwick trees',
    'binary indexed tree',
    'range queries',
    'ordered set',
    'data stream',
    'expression parsing',
    'iterator',
  ],
  'Game Theory': ['game theory', 'games'],
  'Divide and Conquer': [
    'divide and conquer',
    'recursion',
    'backtracking',
    'recursion and backtracking',
    'meet in the middle',
  ],
} as const

const keyFor = (topic: string) =>
  topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const topicByTag = new Map<string, string>(
  Object.entries(topicGroups).flatMap(([topic, tags]) =>
    tags.map((tag) => [keyFor(tag), topic] as const),
  ),
)

export function normalizeTopic(topic: string): string | undefined {
  return topicByTag.get(keyFor(topic))
}

export function normalizeTopicCounts(
  raw: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [tag, count] of Object.entries(raw)) {
    const topic = normalizeTopic(tag)
    if (topic !== undefined && Number.isFinite(count) && count > 0) {
      result[topic] = (result[topic] ?? 0) + count
    }
  }
  return result
}

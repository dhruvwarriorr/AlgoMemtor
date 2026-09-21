// Map of lowercase variants → canonical display name
const TOPIC_ALIASES: Record<string, string> = {
  // Math
  'math': 'Math',
  'mathematics': 'Math',
  // Strings  
  'strings': 'Strings',
  'string': 'Strings',
  // Binary Search
  'binary-search': 'Binary Search',
  'binary search': 'Binary Search',
  // Bit Manipulation
  'bit-manipulation': 'Bit Manipulation',
  'bit manipulation': 'Bit Manipulation',
  'bitmask': 'Bit Manipulation',
  'bitmasks': 'Bit Manipulation',
  // Data Structures
  'data-structures': 'Data Structures',
  'data structures': 'Data Structures',
  // Dynamic Programming
  'dynamic-programming': 'Dynamic Programming',
  'dp': 'Dynamic Programming',
  'dynamic programming': 'Dynamic Programming',
  // Greedy
  'greedy': 'Greedy',
  // Graphs
  'graphs': 'Graphs',
  'graph': 'Graphs',
  // Sorting
  'sortings': 'Sorting',
  'sorting': 'Sorting',
  // Two Pointers
  'two-pointers': 'Two Pointers',
  'two pointers': 'Two Pointers',
  // Trees
  'trees': 'Trees',
  'tree': 'Trees',
  // Implementation
  'implementation': 'Implementation',
  // Brute Force
  'brute-force': 'Brute Force',
  'brute force': 'Brute Force',
  // Constructive Algorithms
  'constructive-algorithms': 'Constructive',
  'constructive algorithms': 'Constructive',
  'constructive': 'Constructive',
  // Number Theory
  'number-theory': 'Number Theory',
  'number theory': 'Number Theory',
  // Combinatorics
  'combinatorics': 'Combinatorics',
  // DFS/BFS
  'dfs-and-similar': 'DFS/BFS',
  'dfs and similar': 'DFS/BFS',
  'dfs': 'DFS/BFS',
  'bfs': 'DFS/BFS',
  'depth-first search': 'DFS/BFS',
  'breadth-first search': 'DFS/BFS',
  // Geometry
  'geometry': 'Geometry',
  // Divide and Conquer
  'divide-and-conquer': 'Divide and Conquer',
  'divide and conquer': 'Divide and Conquer',
  // Stack
  'stack': 'Stack',
  'monotonic stack': 'Stack',
  // Queue
  'queue': 'Queue',
  'monotonic queue': 'Queue',
  // Hashing
  'hashing': 'Hashing',
  'hash': 'Hashing',
  'hash table': 'Hashing',
  // Array
  'array': 'Array',
  'arrays': 'Array',
  // Linked List
  'linked-list': 'Linked List',
  'linked list': 'Linked List',
  // Sliding Window
  'sliding-window': 'Sliding Window',
  'sliding window': 'Sliding Window',
  // Prefix Sum
  'prefix-sum': 'Prefix Sum',
  'prefix sum': 'Prefix Sum',
  // Segment Tree
  'segment-tree': 'Segment Tree',
  'segment tree': 'Segment Tree',
  // Trie
  'trie': 'Trie',
  // Union Find
  'union-find': 'Union Find',
  'union find': 'Union Find',
  'dsu': 'Union Find',
  'disjoint-set-union': 'Union Find',
  'disjoint set union': 'Union Find',
  // Heap / Priority Queue
  'heap': 'Heap',
  'heap (priority queue)': 'Heap',
  'priority queue': 'Heap',
  // Matrix
  'matrix': 'Matrix',
  'matrices': 'Matrix',
  // Recursion
  'recursion': 'Recursion',
  // Backtracking
  'backtracking': 'Backtracking',
  // Simulation
  'simulation': 'Simulation',
  // Design
  'design': 'Design',
  // Game Theory
  'games': 'Game Theory',
  'game theory': 'Game Theory',
  // Shortest Path
  'shortest-paths': 'Shortest Paths',
  'shortest paths': 'Shortest Paths',
  'shortest path': 'Shortest Paths',
  // Probabilities
  'probabilities': 'Probability',
  'probability': 'Probability',
  // Interactive
  'interactive': 'Interactive',
  // Flows
  'flows': 'Network Flow',
  'network flow': 'Network Flow',
  // FFT
  'fft': 'FFT',
  // String Matching
  'string-matching': 'String Matching',
  'string matching': 'String Matching',
  // Topological Sort
  'topological sort': 'Topological Sort',
  'topological-sort': 'Topological Sort',
  // Ordered Set
  'ordered set': 'Ordered Set',
  'ordered-set': 'Ordered Set',
  // Counting
  'counting': 'Counting',
  // Database
  'database': 'Database',
  // Enumeration
  'enumeration': 'Enumeration',
  // Bucket Sort
  'bucket sort': 'Bucket Sort',
  'bucket-sort': 'Bucket Sort',
  // Suffix Array
  'suffix array': 'Suffix Array',
  'suffix-array': 'Suffix Array',
  // Minimum Spanning Tree
  'minimum spanning tree': 'Minimum Spanning Tree',
  'minimum-spanning-tree': 'Minimum Spanning Tree',
  // Biconnected Component
  'biconnected-component': 'Biconnected Component',
  'biconnected component': 'Biconnected Component',
  // Euler Tour
  'euler-tour': 'Euler Tour',
  'euler tour': 'Euler Tour',
  // Strongly Connected Component
  'strongly-connected-component': 'Strongly Connected Component',
  'strongly connected component': 'Strongly Connected Component',
  // Memoization
  'memoization': 'Memoization',
  // Iterator
  'iterator': 'Iterator',
  // Concurrency
  'concurrency': 'Concurrency',
  // Shell
  'shell': 'Shell',
  // Randomized
  'randomized': 'Randomized',
  // Rejection Sampling
  'rejection sampling': 'Rejection Sampling',
  // Reservoir Sampling
  'reservoir sampling': 'Reservoir Sampling',
  // Rolling Hash
  'rolling hash': 'Rolling Hash',
  'rolling-hash': 'Rolling Hash',
  // Line Sweep
  'line sweep': 'Line Sweep',
  'line-sweep': 'Line Sweep',
  // Merge Sort
  'merge sort': 'Merge Sort',
  'merge-sort': 'Merge Sort',
  // Quickselect
  'quickselect': 'Quickselect',
  // Radix Sort
  'radix sort': 'Radix Sort',
  'radix-sort': 'Radix Sort',
  // Counting Sort
  'counting sort': 'Counting Sort',
  'counting-sort': 'Counting Sort',
}

export function normalizeTopic(topic: string): string {
  if (!topic) {
    return ''
  }

  const trimmed = topic.trim().toLowerCase()

  if (TOPIC_ALIASES[trimmed]) {
    return TOPIC_ALIASES[trimmed]
  }

  return trimmed
    .replace(/-/g, ' ')
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function normalizeTopicCounts(
  raw: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [topic, count] of Object.entries(raw)) {
    const normalized = normalizeTopic(topic)
    if (normalized) {
      result[normalized] = (result[normalized] || 0) + count
    }
  }

  return result
}

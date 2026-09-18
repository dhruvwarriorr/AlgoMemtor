import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client.js'

const normalizedTopics = [
  {
    id: 'topic_implementation',
    slug: 'implementation',
    name: 'Implementation',
  },
  { id: 'topic_arrays', slug: 'arrays', name: 'Arrays' },
  { id: 'topic_hashing', slug: 'hashing', name: 'Hashing' },
  {
    id: 'topic_sliding_window',
    slug: 'sliding-window',
    name: 'Sliding Window',
  },
  { id: 'topic_linked_lists', slug: 'linked-lists', name: 'Linked Lists' },
  {
    id: 'topic_heaps_and_priority_queues',
    slug: 'heaps-and-priority-queues',
    name: 'Heaps and Priority Queues',
  },
  { id: 'topic_tries', slug: 'tries', name: 'Tries' },
  { id: 'topic_math', slug: 'math', name: 'Math' },
  {
    id: 'topic_number_theory',
    slug: 'number-theory',
    name: 'Number Theory',
  },
  { id: 'topic_sorting', slug: 'sorting', name: 'Sorting' },
  {
    id: 'topic_binary_search',
    slug: 'binary-search',
    name: 'Binary Search',
  },
  { id: 'topic_two_pointers', slug: 'two-pointers', name: 'Two Pointers' },
  { id: 'topic_prefix_sums', slug: 'prefix-sums', name: 'Prefix Sums' },
  { id: 'topic_greedy', slug: 'greedy', name: 'Greedy' },
  { id: 'topic_strings', slug: 'strings', name: 'Strings' },
  {
    id: 'topic_recursion_and_backtracking',
    slug: 'recursion-and-backtracking',
    name: 'Recursion and Backtracking',
  },
  {
    id: 'topic_stacks_and_queues',
    slug: 'stacks-and-queues',
    name: 'Stacks and Queues',
  },
  { id: 'topic_trees', slug: 'trees', name: 'Trees' },
  { id: 'topic_graphs', slug: 'graphs', name: 'Graphs' },
  { id: 'topic_bfs_and_dfs', slug: 'bfs-and-dfs', name: 'BFS and DFS' },
  {
    id: 'topic_dynamic_programming',
    slug: 'dynamic-programming',
    name: 'Dynamic Programming',
  },
  {
    id: 'topic_bit_manipulation',
    slug: 'bit-manipulation',
    name: 'Bit Manipulation',
  },
  { id: 'topic_segment_trees', slug: 'segment-trees', name: 'Segment Trees' },
  { id: 'topic_fenwick_trees', slug: 'fenwick-trees', name: 'Fenwick Trees' },
  {
    id: 'topic_disjoint_set_union',
    slug: 'disjoint-set-union',
    name: 'Disjoint Set Union',
  },
  {
    id: 'topic_shortest_paths',
    slug: 'shortest-paths',
    name: 'Shortest Paths',
  },
  {
    id: 'topic_minimum_spanning_trees',
    slug: 'minimum-spanning-trees',
    name: 'Minimum Spanning Trees',
  },
  {
    id: 'topic_topological_sort',
    slug: 'topological-sort',
    name: 'Topological Sort',
  },
  {
    id: 'topic_advanced_dynamic_programming',
    slug: 'advanced-dynamic-programming',
    name: 'Advanced Dynamic Programming',
  },
  { id: 'topic_geometry', slug: 'geometry', name: 'Geometry' },
  { id: 'topic_combinatorics', slug: 'combinatorics', name: 'Combinatorics' },
] as const

const prerequisites: Record<string, readonly string[]> = {
  implementation: [],
  arrays: ['implementation'],
  math: ['implementation'],
  strings: ['implementation'],
  'linked-lists': ['implementation'],
  sorting: ['arrays'],
  hashing: ['strings'],
  'prefix-sums': ['arrays'],
  'two-pointers': ['arrays'],
  'sliding-window': ['arrays'],
  'binary-search': ['sorting', 'arrays'],
  greedy: ['sorting'],
  'number-theory': ['math'],
  combinatorics: ['math'],
  geometry: ['math'],
  'stacks-and-queues': ['arrays'],
  'heaps-and-priority-queues': ['trees'],
  'recursion-and-backtracking': ['implementation'],
  trees: ['recursion-and-backtracking'],
  tries: ['strings'],
  graphs: ['recursion-and-backtracking'],
  'bfs-and-dfs': ['graphs', 'stacks-and-queues'],
  'disjoint-set-union': ['graphs', 'bfs-and-dfs'],
  'shortest-paths': ['graphs', 'bfs-and-dfs'],
  'topological-sort': ['graphs', 'bfs-and-dfs'],
  'minimum-spanning-trees': ['disjoint-set-union', 'shortest-paths'],
  'dynamic-programming': ['recursion-and-backtracking'],
  'advanced-dynamic-programming': ['dynamic-programming'],
  'bit-manipulation': ['implementation'],
  'segment-trees': ['trees'],
  'fenwick-trees': ['trees'],
}

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required to seed normalized topics.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

try {
  for (const topic of normalizedTopics) {
    await prisma.normalizedTopic.upsert({
      where: { slug: topic.slug },
      update: {
        name: topic.name,
        prerequisites: [...(prerequisites[topic.slug] ?? [])],
      },
      create: {
        ...topic,
        prerequisites: [...(prerequisites[topic.slug] ?? [])],
      },
    })
  }
} finally {
  await prisma.$disconnect()
}

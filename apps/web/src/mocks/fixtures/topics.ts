import { TopicSchema } from '@algomemtor/shared-contracts'

const TopicFixturesSchema = TopicSchema.array().superRefine(
  (topics, context) => {
    const ids = new Set<string>()
    const slugs = new Set<string>()

    topics.forEach((topic, index) => {
      if (ids.has(topic.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate topic ID: ${topic.id}`,
          path: [index, 'id'],
        })
      }

      if (slugs.has(topic.slug)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate topic slug: ${topic.slug}`,
          path: [index, 'slug'],
        })
      }

      ids.add(topic.id)
      slugs.add(topic.slug)
    })
  },
)

export const topicFixtures = TopicFixturesSchema.parse([
  { id: 'topic_arrays', slug: 'arrays', name: 'Arrays' },
  { id: 'topic_strings', slug: 'strings', name: 'Strings' },
  { id: 'topic_hashing', slug: 'hashing', name: 'Hashing' },
  {
    id: 'topic_sliding_window',
    slug: 'sliding-window',
    name: 'Sliding Window',
  },
  {
    id: 'topic_two_pointers',
    slug: 'two-pointers',
    name: 'Two Pointers',
  },
  {
    id: 'topic_binary_search',
    slug: 'binary-search',
    name: 'Binary Search',
  },
  { id: 'topic_recursion', slug: 'recursion', name: 'Recursion' },
  {
    id: 'topic_linked_lists',
    slug: 'linked-lists',
    name: 'Linked Lists',
  },
  {
    id: 'topic_heaps_and_priority_queues',
    slug: 'heaps-and-priority-queues',
    name: 'Heaps and Priority Queues',
  },
  { id: 'topic_tries', slug: 'tries', name: 'Tries' },
  { id: 'topic_stacks', slug: 'stacks', name: 'Stacks' },
  { id: 'topic_queues', slug: 'queues', name: 'Queues' },
  { id: 'topic_trees', slug: 'trees', name: 'Trees' },
  { id: 'topic_graphs', slug: 'graphs', name: 'Graphs' },
])

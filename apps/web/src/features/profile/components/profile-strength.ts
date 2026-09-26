import type { LearnerProfile } from '@algomemtor/shared-contracts'

export type StrengthItem = {
  key: string
  label: string
  done: boolean
  // Where to fill it in.
  to: string
}

// How much the coach has to work with: each part of the profile the learner
// has filled in, and where to add the rest.
export function profileStrength(
  profile: LearnerProfile,
  linkedAccounts?: number,
) {
  const items: StrengthItem[] = [
    {
      key: 'basics',
      label: 'Level and goal',
      done: true,
      to: '/settings#profile',
    },
    {
      key: 'focus',
      label: 'Focus topics',
      done:
        profile.topicPreference.mode === 'let_algomemtor_suggest' ||
        profile.topicPreference.topics.length > 0,
      to: '/settings#profile',
    },
    {
      key: 'enjoy',
      label: 'Topics you enjoy',
      done: profile.preferredTopics.length > 0,
      to: '/settings#profile',
    },
    {
      key: 'platforms',
      label: 'Practice platforms',
      done: profile.platformPreferences.platforms.length > 0,
      to: '/settings#profile',
    },
    {
      key: 'style',
      label: 'Learning style',
      done: profile.learningPreferences.length > 0,
      to: '/settings#profile',
    },
    {
      key: 'note',
      label: 'Practice note',
      done: Boolean(profile.recommendationPreference),
      to: '/settings#profile',
    },
    {
      key: 'timezone',
      label: 'Timezone',
      done: Boolean(profile.timezone),
      to: '/settings#profile',
    },
  ]
  if (linkedAccounts !== undefined) {
    items.push({
      key: 'linked',
      label: 'A linked public profile',
      done: linkedAccounts > 0,
      to: '/settings#platforms',
    })
  }
  const done = items.filter((item) => item.done).length
  return { items, score: done / items.length }
}

export function readableValue(value: string) {
  const words = value.replaceAll('_', ' ').replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

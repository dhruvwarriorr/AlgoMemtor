import { useState } from 'react'
import type { ProviderKey } from '@algomemtor/shared-contracts'

import { ApiClientError } from '@/features/discovery/api/client'

export const providerLabels: Record<ProviderKey | 'other', string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
  other: 'Other site',
}

export function formatDateTime(value: string, withTime = true) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' as const } : {}),
    }).format(new Date(value))
  } catch {
    return value
  }
}

export const humanTopic = (value: string) => value.replaceAll('-', ' ')

export function mentorErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError && error.message.trim() !== '') {
    return error.message
  }
  return error instanceof Error && error.message.trim() !== ''
    ? error.message
    : fallback
}

export const errorCode = (error: unknown) =>
  error instanceof ApiClientError ? error.code : undefined

export const languageChoices = ['C++', 'Java', 'Python'] as const
const languageStorageKey = 'algomemtor.mentor.language'

// The last language the learner picked, kept in this browser only. An
// explicit initial language (for example from the Test Case Visualizer) wins.
export function useRememberedLanguage(initial?: string) {
  const [language, setLanguage] = useState(() => {
    if (initial !== undefined && initial.trim() !== '') return initial
    try {
      return window.localStorage.getItem(languageStorageKey) ?? 'C++'
    } catch {
      return 'C++'
    }
  })
  return [
    language,
    (value: string) => {
      setLanguage(value)
      try {
        window.localStorage.setItem(languageStorageKey, value)
      } catch {
        // Storage can be unavailable (private windows); the choice still
        // applies to this page.
      }
    },
  ] as const
}

export const inputClass =
  'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-60 sm:text-sm'

import type { LinkableProvider } from '@algomemtor/shared-contracts'

export const providerLabels: Record<LinkableProvider, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
}

export const providerOptions: readonly LinkableProvider[] = [
  'codeforces',
  'codechef',
  'leetcode',
]

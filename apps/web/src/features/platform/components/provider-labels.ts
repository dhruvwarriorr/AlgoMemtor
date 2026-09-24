import type {
  LinkableProvider,
  ProviderKey,
} from '@algomemtor/shared-contracts'

export const providerLabels: Record<ProviderKey, string> = {
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  leetcode: 'LeetCode',
  cses: 'CSES',
}

export const providerOptions: readonly LinkableProvider[] = [
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
]

// CSES has a problem set but no contests.
export const contestProviderOptions: readonly LinkableProvider[] =
  providerOptions.filter((provider) => provider !== 'cses')

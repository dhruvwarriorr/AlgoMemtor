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
]

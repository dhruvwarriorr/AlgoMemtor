// Shapes the connector sends to AlgoMemtor. They mirror the server's
// `ConnectorIngestRequestSchema`, which validates every field again.

export type ConnectorProvider = 'leetcode' | 'cses'

// Every platform the extension handles: LeetCode and CSES upload history;
// Codeforces and CodeChef verify the signed-in handle and ask the server to
// sync.
export type SyncProvider = ConnectorProvider | 'codeforces' | 'codechef'

// The quick handle checks run first, so a long history read never delays
// them.
export const SYNC_PROVIDERS: readonly SyncProvider[] = [
  'codeforces',
  'codechef',
  'leetcode',
  'cses',
]

export type ConnectorSubmission = {
  eventId: string
  externalId: string
  problemTitle?: string
  verdict: string
  isAccepted: boolean
  language?: string
  occurredAt: string
  runtimeMs?: number
  memoryKb?: number
  passedTestCount?: number
}

export type ConnectorSolvedProblem = {
  externalId: string
  title?: string
  section?: string
}

export type ConnectorUpload = {
  provider: ConnectorProvider
  account: { handle: string }
  submissions: ConnectorSubmission[]
  solvedProblems: ConnectorSolvedProblem[]
  solvedListComplete: boolean
  historyComplete: boolean
}

// A GET request to a provider made with the learner's browser session.
export type ProviderRead = (url: string) => Promise<Response>

export type ProviderErrorKind =
  'signed_out' | 'rate_limited' | 'unavailable' | 'invalid'

export class ProviderRequestError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderRequestError'
  }
}

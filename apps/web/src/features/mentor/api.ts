import {
  ContestAnalysisOverviewResponseSchema,
  ContestAnalysisResponseSchema,
  ContestPatternsReportResponseSchema,
  ExploreSolutionsRequestSchema,
  ProblemHelpSessionResponseSchema,
  ProblemHelpSessionsResponseSchema,
  ProblemHelpTurnRequestSchema,
  ProgressNarrativeResponseSchema,
  ProgressReportResponseSchema,
  SolutionAccessResponseSchema,
  SolutionChatRequestSchema,
  SolutionChatResponseSchema,
  SolutionExplorationResponseSchema,
  SolutionExplorationsResponseSchema,
  StartProblemHelpRequestSchema,
  UpdateUpsolveItemRequestSchema,
  UpsolveResponseSchema,
  type ExploreSolutionsRequest,
  type ProblemHelpTurnRequest,
  type ProviderKey,
  type SolutionChatRequest,
  type StartProblemHelpRequest,
  type UpdateUpsolveItemRequest,
} from '@algomemtor/shared-contracts'

import { requestJson } from '@/features/discovery/api/client'

type RequestOptions = { signal?: AbortSignal }

const jsonHeaders = { 'content-type': 'application/json' }

const emptyResponseSchema = {
  safeParse(value: unknown) {
    return value === null
      ? { success: true as const, data: undefined }
      : { success: false as const, error: { issues: [] } }
  },
}

const post = <T>(
  path: string,
  body: unknown,
  schema: Parameters<typeof requestJson<T>>[1]['schema'],
  signal?: AbortSignal,
) =>
  requestJson(path, {
    authentication: 'required',
    body: JSON.stringify(body),
    headers: jsonHeaders,
    method: 'POST',
    schema,
    signal,
  })

// Doubt Helper -------------------------------------------------------------

export function fetchHelpSessions({ signal }: RequestOptions = {}) {
  return requestJson('/api/problem-help/sessions', {
    authentication: 'required',
    schema: ProblemHelpSessionsResponseSchema,
    signal,
  })
}

export function fetchHelpSession(id: string, { signal }: RequestOptions = {}) {
  return requestJson(`/api/problem-help/sessions/${encodeURIComponent(id)}`, {
    authentication: 'required',
    schema: ProblemHelpSessionResponseSchema,
    signal,
  })
}

export function startHelpSession(
  input: StartProblemHelpRequest,
  signal?: AbortSignal,
) {
  return post(
    '/api/problem-help/sessions',
    StartProblemHelpRequestSchema.parse(input),
    ProblemHelpSessionResponseSchema,
    signal,
  )
}

export function sendHelpTurn(
  id: string,
  input: ProblemHelpTurnRequest,
  signal?: AbortSignal,
) {
  return post(
    `/api/problem-help/sessions/${encodeURIComponent(id)}/turns`,
    ProblemHelpTurnRequestSchema.parse(input),
    ProblemHelpSessionResponseSchema,
    signal,
  )
}

// Solution Explorer --------------------------------------------------------

export function fetchExplorations({ signal }: RequestOptions = {}) {
  return requestJson('/api/solutions', {
    authentication: 'required',
    schema: SolutionExplorationsResponseSchema,
    signal,
  })
}

export function fetchSolutionAccess(
  problemUrl: string,
  language: string,
  { signal }: RequestOptions = {},
) {
  const query = new URLSearchParams({ problemUrl, language })
  return requestJson(`/api/solutions/access?${query.toString()}`, {
    authentication: 'required',
    schema: SolutionAccessResponseSchema,
    signal,
  })
}

export function exploreSolutions(input: ExploreSolutionsRequest) {
  return post(
    '/api/solutions/explore',
    ExploreSolutionsRequestSchema.parse(input),
    SolutionExplorationResponseSchema,
  )
}

export function askSolutionChat(input: SolutionChatRequest) {
  return post(
    '/api/solutions/chat',
    SolutionChatRequestSchema.parse(input),
    SolutionChatResponseSchema,
  )
}

// Upsolve ------------------------------------------------------------------

// `refresh` pulls the learner's newest platform data before recomputing.
export function fetchUpsolve({
  signal,
  refresh = false,
}: RequestOptions & { refresh?: boolean } = {}) {
  return requestJson(refresh ? '/api/upsolve?refresh=true' : '/api/upsolve', {
    authentication: 'required',
    schema: UpsolveResponseSchema,
    signal,
  })
}

export function updateUpsolveItem(
  provider: ProviderKey,
  externalId: string,
  input: UpdateUpsolveItemRequest,
) {
  return requestJson(
    `/api/upsolve/items/${provider}/${encodeURIComponent(externalId)}`,
    {
      authentication: 'required',
      body: JSON.stringify(UpdateUpsolveItemRequestSchema.parse(input)),
      headers: jsonHeaders,
      method: 'PUT',
      schema: emptyResponseSchema,
    },
  )
}

// Contest analysis ---------------------------------------------------------

export function fetchContestOverview({
  signal,
  refresh = false,
}: RequestOptions & { refresh?: boolean } = {}) {
  const path = refresh
    ? '/api/contest-analysis?refresh=true'
    : '/api/contest-analysis'
  return requestJson(path, {
    authentication: 'required',
    schema: ContestAnalysisOverviewResponseSchema,
    signal,
  })
}

export function fetchContestDetail(
  provider: ProviderKey,
  contestId: string,
  { signal }: RequestOptions = {},
) {
  return requestJson(
    `/api/contest-analysis/${provider}/${encodeURIComponent(contestId)}`,
    {
      authentication: 'required',
      schema: ContestAnalysisResponseSchema,
      signal,
    },
  )
}

export function generateContestNarrative(
  provider: ProviderKey,
  contestId: string,
  refresh: boolean,
) {
  return post(
    `/api/contest-analysis/${provider}/${encodeURIComponent(contestId)}/narrative`,
    { refresh },
    ContestAnalysisResponseSchema,
  )
}

export function generateContestPatterns(refresh: boolean) {
  return post(
    '/api/contest-analysis/patterns/report',
    { refresh },
    ContestPatternsReportResponseSchema,
  )
}

// Progress report ----------------------------------------------------------

export function fetchProgressReport({ signal }: RequestOptions = {}) {
  return requestJson('/api/progress-report', {
    authentication: 'required',
    schema: ProgressReportResponseSchema,
    signal,
  })
}

export function generateProgressNarrative(refresh: boolean) {
  return post(
    '/api/progress-report/narrative',
    { refresh },
    ProgressNarrativeResponseSchema,
  )
}

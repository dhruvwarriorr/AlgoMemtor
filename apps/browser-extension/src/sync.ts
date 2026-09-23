import {
  csesSolvedProblems,
  fetchCsesProblemset,
  fetchCsesTaskSubmissions,
} from './cses.js'
import {
  fetchLeetCodeStatuses,
  fetchLeetCodeSubmissionPage,
  LEETCODE_PAGE_SIZE,
  type ProviderPost,
} from './leetcode.js'
import type { ConnectorState, LeetCodeBackfill, SyncOutcome } from './state.js'
import {
  ProviderRequestError,
  type ConnectorSolvedProblem,
  type ConnectorSubmission,
  type ConnectorUpload,
  type ProviderRead,
} from './types.js'

export class UploadError extends Error {
  constructor(
    readonly unpaired: boolean,
    message: string,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

export type SyncDeps = {
  read: ProviderRead
  // GraphQL POSTs made from the provider page; enables LeetCode fallbacks.
  post?: ProviderPost
  // Runs a self-contained function in a provider page (page reads only).
  evaluate?: <T>(
    origin: string,
    func: () => T,
  ) => Promise<Awaited<T> | undefined>
  upload: (upload: ConnectorUpload) => Promise<void>
  sleep: (ms: number) => Promise<void>
  now: () => Date
  // Requests per run and the pause between them keep each run short and
  // under provider rate limits; unfinished history continues next run.
  leetcodePageBudget?: number
  csesTaskBudget?: number
  requestSpacingMs?: number
}

const MAX_UPLOAD_SUBMISSIONS = 1000

const outcome = (
  deps: SyncDeps,
  status: SyncOutcome['status'],
  message: string,
  rest: Partial<SyncOutcome> = {},
): SyncOutcome => ({
  status,
  message,
  at: deps.now().toISOString(),
  uploadedSubmissions: 0,
  historyComplete: false,
  continueSoon: false,
  ...rest,
})

export const failure = (deps: SyncDeps, error: unknown): SyncOutcome => {
  if (error instanceof UploadError) {
    return outcome(deps, error.unpaired ? 'unpaired' : 'error', error.message)
  }
  if (error instanceof ProviderRequestError) {
    if (error.kind === 'signed_out')
      return outcome(deps, 'signed_out', error.message)
    if (error.kind === 'rate_limited')
      return outcome(deps, 'rate_limited', error.message, {
        continueSoon: true,
      })
    return outcome(deps, 'error', error.message)
  }
  // Keep the real reason visible (popup and server report) for diagnosis.
  const detail = error instanceof Error ? error.message : String(error)
  return outcome(deps, 'error', `The sync failed: ${detail}`.slice(0, 280))
}

// Uploads in chunks the server accepts. The solved list goes with the first
// chunk, which also runs when there are no new submissions.
const uploadAll = async (
  deps: SyncDeps,
  base: Omit<
    ConnectorUpload,
    'submissions' | 'solvedProblems' | 'solvedListComplete'
  >,
  submissions: ConnectorSubmission[],
  solved: ConnectorSolvedProblem[],
  solvedComplete = true,
) => {
  let index = 0
  do {
    const chunk = submissions.slice(index, index + MAX_UPLOAD_SUBMISSIONS)
    await deps.upload({
      ...base,
      submissions: chunk,
      solvedProblems: index === 0 ? solved : [],
      solvedListComplete: index === 0 && solvedComplete,
    })
    index += MAX_UPLOAD_SUBMISSIONS
  } while (index < submissions.length)
}

export const syncLeetCode = async (
  deps: SyncDeps,
  state: ConnectorState,
): Promise<{ state: ConnectorState; outcome: SyncOutcome }> => {
  const budget = deps.leetcodePageBudget ?? 25
  const spacing = deps.requestSpacingMs ?? 1500
  try {
    const statuses = await fetchLeetCodeStatuses(deps.read, deps.post)
    if (statuses.username === null) {
      return {
        state,
        outcome: outcome(
          deps,
          'signed_out',
          'Sign in to LeetCode in this browser.',
        ),
      }
    }
    // A different signed-in account starts its own history.
    let current = state.leetcode
    if (current.handle !== statuses.username) {
      current = {
        handle: statuses.username,
        backfill: { phase: 'not_started' },
      }
    }

    const collected = new Map<string, ConnectorSubmission>()
    let pages = 0
    let rateLimited = false
    let newestSeen = current.newestId
    // The catch-up passes the newest uploaded ID so rows already uploaded are
    // not sent (or counted) again.
    const remember = (
      page: Awaited<ReturnType<typeof fetchLeetCodeSubmissionPage>>,
      uploadedUpTo?: number,
    ) => {
      for (const submission of page.submissions) {
        if (
          uploadedUpTo !== undefined &&
          Number(submission.eventId) <= uploadedUpTo
        )
          continue
        collected.set(submission.eventId, submission)
      }
      for (const id of page.ids)
        if (newestSeen === undefined || id > newestSeen) newestSeen = id
    }

    // 1. Catch up on submissions newer than the newest one already uploaded.
    let caughtUp = current.newestId === undefined
    // Advanced only after a page is read, so an interrupted run resumes from
    // the last page it actually uploads.
    let backfill: LeetCodeBackfill = current.backfill
    try {
      if (current.newestId !== undefined) {
        let offset = 0
        let lastKey = ''
        while (pages < budget) {
          const page = await fetchLeetCodeSubmissionPage(
            deps.read,
            offset,
            lastKey,
            deps.post,
          )
          pages += 1
          remember(page, current.newestId)
          if (
            page.ids.some((id) => id <= (current.newestId ?? 0)) ||
            !page.hasNext
          ) {
            caughtUp = true
            break
          }
          offset += LEETCODE_PAGE_SIZE
          lastKey = page.lastKey
          await deps.sleep(spacing)
        }
      }

      // 2. Continue the full-history backfill from where it stopped. New
      // submissions shift offsets, which only re-reads rows, never skips.
      if (backfill.phase !== 'done') {
        let offset = backfill.phase === 'running' ? backfill.offset : 0
        let lastKey = backfill.phase === 'running' ? backfill.lastKey : ''
        while (pages < budget) {
          if (pages > 0) await deps.sleep(spacing)
          const page = await fetchLeetCodeSubmissionPage(
            deps.read,
            offset,
            lastKey,
            deps.post,
          )
          pages += 1
          remember(page)
          if (!page.hasNext) {
            backfill = { phase: 'done' }
            break
          }
          offset += LEETCODE_PAGE_SIZE
          lastKey = page.lastKey
          backfill = { phase: 'running', offset, lastKey }
        }
      }
    } catch (error) {
      if (
        !(error instanceof ProviderRequestError) ||
        error.kind !== 'rate_limited'
      )
        throw error
      rateLimited = true
    }
    current = { ...current, backfill }

    const submissions = [...collected.values()]
    await uploadAll(
      deps,
      {
        provider: 'leetcode',
        account: { handle: statuses.username },
        historyComplete: current.backfill.phase === 'done',
      },
      submissions,
      statuses.solved,
      statuses.solvedComplete,
    )
    // Only now is it safe to move the resume points forward.
    const nextState: ConnectorState = {
      ...state,
      leetcode: {
        ...current,
        ...(caughtUp && newestSeen !== undefined
          ? { newestId: newestSeen }
          : {}),
      },
    }
    const historyComplete = current.backfill.phase === 'done'
    const continueSoon = rateLimited || !historyComplete || !caughtUp
    return {
      state: nextState,
      outcome: outcome(
        deps,
        rateLimited ? 'rate_limited' : 'synced',
        rateLimited
          ? `Uploaded ${submissions.length} submissions; LeetCode asked to slow down, continuing shortly.`
          : historyComplete
            ? `Up to date: uploaded ${submissions.length} new submissions and ${statuses.solved.length} solved problems.`
            : `Uploaded ${submissions.length} submissions; loading older history in the next run.`,
        {
          handle: statuses.username,
          uploadedSubmissions: submissions.length,
          historyComplete,
          continueSoon,
        },
      ),
    }
  } catch (error) {
    return { state, outcome: failure(deps, error) }
  }
}

export const syncCses = async (
  deps: SyncDeps,
  state: ConnectorState,
): Promise<{ state: ConnectorState; outcome: SyncOutcome }> => {
  const budget = deps.csesTaskBudget ?? 20
  const spacing = deps.requestSpacingMs ?? 1500
  try {
    const problemset = await fetchCsesProblemset(deps.read)
    if (problemset.userId === null) {
      return {
        state,
        outcome: outcome(
          deps,
          'signed_out',
          'Sign in to CSES in this browser.',
        ),
      }
    }
    let fetched =
      state.cses.userId === problemset.userId ? state.cses.fetched : {}
    // Earliest tasks first, and only tasks whose status changed since their
    // submissions were last read.
    const pending = problemset.tasks
      .filter(
        (task) => task.status !== 'none' && fetched[task.id] !== task.status,
      )
      .sort((left, right) => Number(left.id) - Number(right.id))
    const submissions: ConnectorSubmission[] = []
    const fetchedNow: Record<string, 'solved' | 'attempted'> = {}
    let rateLimited = false
    for (const task of pending.slice(0, budget)) {
      if (task.status === 'none') continue
      if (Object.keys(fetchedNow).length > 0) await deps.sleep(spacing)
      try {
        submissions.push(
          ...(await fetchCsesTaskSubmissions(deps.read, task.id, task.title)),
        )
        fetchedNow[task.id] = task.status
      } catch (error) {
        if (
          error instanceof ProviderRequestError &&
          error.kind === 'rate_limited'
        ) {
          rateLimited = true
          break
        }
        throw error
      }
    }
    const remaining = pending.length - Object.keys(fetchedNow).length
    await uploadAll(
      deps,
      {
        provider: 'cses',
        account: { handle: problemset.userId },
        historyComplete: remaining === 0,
      },
      submissions,
      csesSolvedProblems(problemset),
    )
    fetched = { ...fetched, ...fetchedNow }
    return {
      state: { ...state, cses: { userId: problemset.userId, fetched } },
      outcome: outcome(
        deps,
        rateLimited ? 'rate_limited' : 'synced',
        remaining === 0
          ? `Up to date: ${csesSolvedProblems(problemset).length} solved tasks.`
          : `Read ${Object.keys(fetchedNow).length} tasks; ${remaining} left for the next run.`,
        {
          handle: problemset.userId,
          uploadedSubmissions: submissions.length,
          historyComplete: remaining === 0,
          continueSoon: remaining > 0,
        },
      ),
    }
  } catch (error) {
    return { state, outcome: failure(deps, error) }
  }
}

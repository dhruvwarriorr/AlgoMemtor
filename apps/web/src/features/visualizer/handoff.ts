import { programmingLanguageFamily } from '@algomemtor/shared-contracts'

import type { VisualizerLanguage } from './trace'

// Code and test data travel between the mentor tools and the visualizer as
// browser navigation state. They are never sent to the server by the
// visualizer and never stored beyond this browser tab.

export const VISUALIZER_PATH = '/visualizer'
export const CODE_LIMIT = 12_000
export const INPUT_LIMIT = 20_000

export type VisualizerSource = 'doubt_helper' | 'solution_explorer'

export type VisualizerHandoff = {
  source: VisualizerSource
  language: VisualizerLanguage
  code: string
  input?: string
  expected?: string
  problem?: { title: string; url?: string }
  // Doubt Helper session to send questions about a step to.
  sessionId?: string
  // Solution Explorer approach name.
  approach?: string
}

export type DoubtQuestionHandoff = {
  content: string
  code: string
}

export type DoubtIntakeHandoff = {
  code: string
  language: string
  details: string
}

export function visualizerLanguageFor(
  language: string,
): VisualizerLanguage | null {
  const family = programmingLanguageFamily(language)
  if (family === 'C++' || family === 'C') return 'cpp'
  if (family === 'Python') return 'python'
  return null
}

export const mentorLanguageFor: Record<VisualizerLanguage, string> = {
  cpp: 'C++',
  python: 'Python',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const text = (value: unknown, limit: number): string | undefined =>
  typeof value === 'string' && value.length <= limit ? value : undefined

// History state can hold anything; only well-formed handoffs are used.
export function readVisualizerHandoff(
  state: unknown,
): VisualizerHandoff | null {
  if (!isRecord(state) || !isRecord(state.visualizer)) return null
  const raw = state.visualizer
  if (raw.source !== 'doubt_helper' && raw.source !== 'solution_explorer')
    return null
  if (raw.language !== 'cpp' && raw.language !== 'python') return null
  const code = text(raw.code, CODE_LIMIT)
  if (code === undefined) return null
  const handoff: VisualizerHandoff = {
    source: raw.source,
    language: raw.language,
    code,
  }
  const input = text(raw.input, INPUT_LIMIT)
  if (input !== undefined) handoff.input = input
  const expected = text(raw.expected, INPUT_LIMIT)
  if (expected !== undefined) handoff.expected = expected
  if (isRecord(raw.problem)) {
    const title = text(raw.problem.title, 200)
    if (title !== undefined) {
      const url = text(raw.problem.url, 2_000)
      handoff.problem =
        url !== undefined && url.startsWith('https://')
          ? { title, url }
          : { title }
    }
  }
  const sessionId = text(raw.sessionId, 64)
  if (sessionId !== undefined && /^[0-9a-f-]{36}$/i.test(sessionId))
    handoff.sessionId = sessionId
  const approach = text(raw.approach, 120)
  if (approach !== undefined) handoff.approach = approach
  return handoff
}

export function readDoubtQuestion(state: unknown): DoubtQuestionHandoff | null {
  if (!isRecord(state) || !isRecord(state.visualizerQuestion)) return null
  const content = text(state.visualizerQuestion.content, 2_000)
  const code = text(state.visualizerQuestion.code, CODE_LIMIT)
  if (content === undefined || code === undefined) return null
  return { content, code }
}

export function readDoubtIntake(state: unknown): DoubtIntakeHandoff | null {
  if (!isRecord(state) || !isRecord(state.visualizerIntake)) return null
  const code = text(state.visualizerIntake.code, CODE_LIMIT)
  const language = text(state.visualizerIntake.language, 64)
  const details = text(state.visualizerIntake.details, 4_000)
  if (code === undefined || language === undefined || details === undefined)
    return null
  return { code, language, details }
}

// ---- draft kept in this tab ----------------------------------------------------------------

const draftKey = 'algomemtor.visualizer.draft'

export type VisualizerContext = Omit<
  VisualizerHandoff,
  'language' | 'code' | 'input' | 'expected'
>

export type VisualizerDraft = {
  language: VisualizerLanguage
  code: string
  input: string
  expected: string
  context: VisualizerContext | null
}

export function loadDraft(): VisualizerDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const language =
      parsed.language === 'python'
        ? 'python'
        : parsed.language === 'cpp'
          ? 'cpp'
          : null
    const code = text(parsed.code, CODE_LIMIT)
    const input = text(parsed.input, INPUT_LIMIT)
    const expected = text(parsed.expected, INPUT_LIMIT)
    if (
      language === null ||
      code === undefined ||
      input === undefined ||
      expected === undefined
    ) {
      return null
    }
    const context = readVisualizerHandoff({
      visualizer: isRecord(parsed.context)
        ? { ...parsed.context, language, code }
        : null,
    })
    return {
      language,
      code,
      input,
      expected,
      context: context === null ? null : contextOf(context),
    }
  } catch {
    return null
  }
}

export function contextOf(handoff: VisualizerHandoff): VisualizerContext {
  const context: VisualizerContext = { source: handoff.source }
  if (handoff.problem !== undefined) context.problem = handoff.problem
  if (handoff.sessionId !== undefined) context.sessionId = handoff.sessionId
  if (handoff.approach !== undefined) context.approach = handoff.approach
  return context
}

export function saveDraft(draft: VisualizerDraft) {
  try {
    window.sessionStorage.setItem(draftKey, JSON.stringify(draft))
  } catch {
    // The draft stays in memory when storage is unavailable.
  }
}

// Doubt Helper keeps the code from the intake in this tab so a session can
// open it in the visualizer. It is never sent anywhere by this.
const doubtCodeKey = (sessionId: string) => `algomemtor.doubt.code.${sessionId}`

export function rememberDoubtCode(
  sessionId: string,
  code: string,
  input: string,
) {
  try {
    window.sessionStorage.setItem(
      doubtCodeKey(sessionId),
      JSON.stringify({ code, input }),
    )
  } catch {
    // Optional convenience only.
  }
}

export function recallDoubtCode(
  sessionId: string,
): { code: string; input: string } | null {
  try {
    const raw = window.sessionStorage.getItem(doubtCodeKey(sessionId))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const code = text(parsed.code, CODE_LIMIT)
    const input = text(parsed.input, INPUT_LIMIT)
    return code === undefined ? null : { code, input: input ?? '' }
  } catch {
    return null
  }
}

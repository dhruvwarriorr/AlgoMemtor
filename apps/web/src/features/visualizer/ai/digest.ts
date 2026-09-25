// A compact, factual summary of a recorded run for the AI Debugger: the
// moments that matter (errors, the first wrong output, branch decisions,
// calls, warnings, the step the learner is looking at) with the variables at
// each. It is built from the trace only and sent only when the learner asks.

import {
  VISUALIZER_DEBUG_MOMENT_LIMIT,
  VISUALIZER_DEBUG_OUTPUT_LIMIT,
  type VisualizerTraceDigest,
  type VisualizerTraceMoment,
} from '@algomemtor/shared-contracts'

import {
  compareOutput,
  describeStep,
  formatValue,
  shorten,
  type OutputComparison,
} from '../analysis'
import { narrate } from '../scene/narrate'
import type { ExecutionTrace } from '../trace'

function clip(text: string, limit: number) {
  if (text.length <= limit) return text
  // Keep the start and the end: the end is often where it goes wrong.
  const head = Math.floor(limit * 0.6)
  const tail = limit - head - 5
  return `${text.slice(0, head)}\n…\n${text.slice(-tail)}`
}

function variablesText(
  trace: ExecutionTrace,
  index: number,
): string | undefined {
  const step = trace.steps[index]
  if (step === undefined) return undefined
  const top = step.frames.at(-1)
  const global = step.frames.find((frame) => frame.id === 0)
  const parts: string[] = []
  for (const frame of [top, global]) {
    if (
      frame === undefined ||
      (frame === global && frame === top && parts.length > 0)
    )
      continue
    for (const [name, id] of frame.vars) {
      if (name === 'this' || name === 'self') continue
      parts.push(`${name}=${shorten(formatValue(trace, id), 60)}`)
    }
    if (frame === top && global !== undefined && global !== top) parts.push('|')
  }
  const text = parts.join(' ').replace(/\s\|$/, '')
  return text === '' ? undefined : shorten(text, 600)
}

function momentAt(
  trace: ExecutionTrace,
  index: number,
  sourceLines: readonly string[],
): VisualizerTraceMoment | null {
  const step = trace.steps[index]
  if (step === undefined) return null
  const narration = narrate(trace, index, sourceLines)
  const summary = [
    narration.headline,
    narration.evaluated !== undefined && narration.code !== undefined
      ? `(${narration.code} → ${narration.evaluated})`
      : '',
    ...(narration.detail ?? []).slice(0, 2),
  ]
    .filter((part) => part !== '')
    .join(' · ')
  const variables = variablesText(trace, index)
  return {
    step: index + 1,
    line: Math.max(1, step.line),
    event: step.event,
    summary: shorten(
      summary || describeStep(trace, index, sourceLines).title,
      300,
    ),
    ...(variables === undefined ? {} : { variables }),
  }
}

// Which steps to describe, most important first.
function pickMoments(
  trace: ExecutionTrace,
  comparison: OutputComparison | null,
  focus: number | null,
): number[] {
  const count = trace.steps.length
  const picked = new Set<number>()
  const add = (index: number | null | undefined) => {
    if (index === null || index === undefined) return
    if (index >= 0 && index < count) picked.add(index)
  }
  const limit = VISUALIZER_DEBUG_MOMENT_LIMIT
  add(0)
  add(count - 1)
  const error = trace.steps.findIndex((step) => step.event === 'error')
  if (error >= 0) for (let i = error - 4; i <= error; i += 1) add(i)
  if (comparison?.status === 'mismatch' && comparison.step !== null) {
    for (let i = comparison.step - 3; i <= comparison.step; i += 1) add(i)
  }
  if (focus !== null) for (let i = focus - 2; i <= focus + 1; i += 1) add(i)
  trace.steps.forEach((step, index) => {
    if (step.notes !== undefined && picked.size < limit * 0.6) add(index)
  })
  // Branch decisions that differ from the previous time on the same line.
  const lastDecision = new Map<number, boolean>()
  const candidates: number[] = []
  trace.steps.forEach((step, index) => {
    if (step.cond === undefined) return
    const before = lastDecision.get(step.line)
    if (before === undefined || before !== step.cond) candidates.push(index)
    lastDecision.set(step.line, step.cond)
  })
  // Output steps, the first visit of each line, calls and returns.
  const firstVisit = new Map<number, number>()
  trace.steps.forEach((step, index) => {
    if (!firstVisit.has(step.line)) firstVisit.set(step.line, index)
    const previous = trace.steps[index - 1]
    if (previous !== undefined && step.out > previous.out)
      candidates.push(index)
  })
  candidates.push(...firstVisit.values())
  trace.steps.forEach((step, index) => {
    if (step.event === 'call' || step.event === 'return') candidates.push(index)
  })
  for (const index of candidates) {
    if (picked.size >= limit) break
    add(index)
  }
  // Fill evenly across the run.
  if (picked.size < limit && count > 0) {
    const stride = Math.max(1, Math.floor(count / (limit - picked.size + 1)))
    for (let index = 0; index < count && picked.size < limit; index += stride)
      add(index)
  }
  return [...picked].sort((a, b) => a - b).slice(0, limit)
}

export function traceDigest(
  trace: ExecutionTrace,
  sourceLines: readonly string[],
  expected: string,
  focus: number | null,
): VisualizerTraceDigest {
  const comparison =
    expected.trim() === '' || trace.steps.length === 0
      ? null
      : compareOutput(trace, expected)
  const error = trace.error
  const errorStep = trace.steps.findIndex((step) => step.event === 'error')
  const moments = pickMoments(trace, comparison, focus)
    .map((index) => momentAt(trace, index, sourceLines))
    .filter((moment): moment is VisualizerTraceMoment => moment !== null)
  const focusStep = focus === null ? undefined : trace.steps[focus]
  return {
    status: trace.status,
    recordedSteps: trace.steps.length,
    totalSteps: trace.totalSteps,
    truncated: trace.truncated,
    ...(error === undefined
      ? {}
      : {
          error: {
            kind: error.kind,
            title: shorten(error.title, 120),
            message: shorten(error.message, 600),
            ...(error.line === undefined
              ? {}
              : { line: Math.max(1, error.line) }),
            ...(errorStep >= 0 ? { step: errorStep + 1 } : {}),
            ...(error.details === undefined
              ? {}
              : {
                  details: error.details
                    .slice(0, 6)
                    .map((detail) => shorten(detail, 300)),
                }),
          },
        }),
    stdout: clip(trace.stdout, VISUALIZER_DEBUG_OUTPUT_LIMIT),
    ...(expected.trim() === ''
      ? {}
      : { expected: clip(expected, VISUALIZER_DEBUG_OUTPUT_LIMIT) }),
    ...(comparison?.status === 'mismatch'
      ? {
          mismatch: {
            token: comparison.token,
            expected:
              comparison.expected === null
                ? null
                : shorten(comparison.expected, 200),
            actual:
              comparison.actual === null
                ? null
                : shorten(comparison.actual, 200),
            ...(comparison.step === null ? {} : { step: comparison.step + 1 }),
          },
        }
      : {}),
    warnings: trace.warnings.slice(0, 12).map((warning) => ({
      step: Math.max(1, warning.step + 1),
      line: Math.max(1, warning.line),
      message: shorten(warning.message, 300),
    })),
    moments,
    ...(focus === null || focusStep === undefined
      ? {}
      : {
          focus: {
            step: focus + 1,
            line: Math.max(1, focusStep.line),
            description: shorten(
              [
                momentAt(trace, focus, sourceLines)?.summary ?? '',
                `Code: ${(sourceLines[focusStep.line - 1] ?? '').trim()}`,
                variablesText(trace, focus) ?? '',
              ]
                .filter((part) => part !== '')
                .join('\n'),
              1_500,
            ),
          },
        }),
  }
}

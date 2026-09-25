import { z } from 'zod'

import { isSafeCoachPublicUrl } from './coach.js'

// The AI Debugger of the Test Case Visualizer. The browser runs the learner's
// program itself and sends a compact digest of the recorded execution with
// the code: what happened at the important steps, the error, the output and
// the expected output. The model explains where the program goes wrong and
// points at lines and steps of that recording. Code, input and the digest are
// transient request fields: they are never stored or echoed back.

const nonEmptyStringSchema = z.string().trim().min(1)
const lineSchema = z.number().int().min(1).max(100_000)
const stepSchema = z.number().int().min(1).max(1_000_000)

export const VISUALIZER_DEBUG_CODE_LIMIT = 12_000
export const VISUALIZER_DEBUG_INPUT_LIMIT = 20_000
export const VISUALIZER_DEBUG_OUTPUT_LIMIT = 4_000
export const VISUALIZER_DEBUG_MOMENT_LIMIT = 60
export const VISUALIZER_DEBUG_HISTORY_LIMIT = 10
export const VISUALIZER_DEBUG_FINDING_LIMIT = 6

export const VisualizerLanguageSchema = z.enum(['cpp', 'python', 'java'])
export type VisualizerDebugLanguage = z.infer<typeof VisualizerLanguageSchema>

export const VisualizerDebugModeSchema = z.enum(['diagnose', 'ask'])
export type VisualizerDebugMode = z.infer<typeof VisualizerDebugModeSchema>

export const VisualizerTraceEventSchema = z.enum([
  'line',
  'call',
  'return',
  'error',
])

// One recorded moment: what the step did and the variables it touched.
export const VisualizerTraceMomentSchema = z
  .object({
    step: stepSchema,
    line: lineSchema,
    event: VisualizerTraceEventSchema,
    summary: nonEmptyStringSchema.max(300),
    variables: z.string().max(600).optional(),
  })
  .strict()
export type VisualizerTraceMoment = z.infer<typeof VisualizerTraceMomentSchema>

export const VisualizerTraceErrorSchema = z
  .object({
    kind: nonEmptyStringSchema.max(40),
    title: nonEmptyStringSchema.max(120),
    message: z.string().max(600),
    line: lineSchema.optional(),
    step: stepSchema.optional(),
    details: z.array(z.string().max(300)).max(6).optional(),
  })
  .strict()

export const VisualizerOutputMismatchSchema = z
  .object({
    token: z.number().int().min(1),
    expected: z.string().max(200).nullable(),
    actual: z.string().max(200).nullable(),
    step: stepSchema.optional(),
  })
  .strict()

export const VisualizerTraceWarningSchema = z
  .object({
    step: stepSchema,
    line: lineSchema,
    message: nonEmptyStringSchema.max(300),
  })
  .strict()

export const VisualizerTraceDigestSchema = z
  .object({
    status: z.enum(['finished', 'error']),
    recordedSteps: z.number().int().min(0),
    totalSteps: z.number().int().min(0),
    truncated: z.boolean(),
    error: VisualizerTraceErrorSchema.optional(),
    stdout: z.string().max(VISUALIZER_DEBUG_OUTPUT_LIMIT),
    expected: z.string().max(VISUALIZER_DEBUG_OUTPUT_LIMIT).optional(),
    mismatch: VisualizerOutputMismatchSchema.optional(),
    warnings: z.array(VisualizerTraceWarningSchema).max(12),
    moments: z
      .array(VisualizerTraceMomentSchema)
      .max(VISUALIZER_DEBUG_MOMENT_LIMIT),
    // The step the learner is looking at when they ask.
    focus: z
      .object({
        step: stepSchema,
        line: lineSchema,
        description: nonEmptyStringSchema.max(1_500),
      })
      .strict()
      .optional(),
  })
  .strict()
export type VisualizerTraceDigest = z.infer<typeof VisualizerTraceDigestSchema>

export const VisualizerDebugTurnSchema = z
  .object({
    role: z.enum(['learner', 'mentor']),
    content: nonEmptyStringSchema.max(6_000),
  })
  .strict()
export type VisualizerDebugTurn = z.infer<typeof VisualizerDebugTurnSchema>

export const VisualizerDebugRequestSchema = z
  .object({
    mode: VisualizerDebugModeSchema,
    language: VisualizerLanguageSchema,
    // Not trimmed: removing leading blank lines would shift the line numbers
    // the recorded trace and the findings refer to.
    code: z
      .string()
      .max(VISUALIZER_DEBUG_CODE_LIMIT)
      .refine((value) => value.trim().length > 0, {
        message: 'Paste your code.',
      }),
    input: z.string().max(VISUALIZER_DEBUG_INPUT_LIMIT),
    question: nonEmptyStringSchema.max(2_000).optional(),
    history: z
      .array(VisualizerDebugTurnSchema)
      .max(VISUALIZER_DEBUG_HISTORY_LIMIT)
      .optional(),
    problem: z
      .object({
        title: nonEmptyStringSchema.max(200).optional(),
        url: z
          .string()
          .url()
          .refine(isSafeCoachPublicUrl, {
            message: 'Only public HTTPS URLs are allowed.',
          })
          .optional(),
      })
      .strict()
      .optional(),
    digest: VisualizerTraceDigestSchema,
  })
  .strict()
  .refine((value) => value.mode !== 'ask' || value.question !== undefined, {
    message: 'Ask a question.',
    path: ['question'],
  })
export type VisualizerDebugRequest = z.infer<
  typeof VisualizerDebugRequestSchema
>

export const VisualizerFindingCategorySchema = z.enum([
  'logic',
  'off_by_one',
  'overflow',
  'boundary',
  'initialization',
  'wrong_condition',
  'input_output',
  'runtime_error',
  'complexity',
  'other',
])
export type VisualizerFindingCategory = z.infer<
  typeof VisualizerFindingCategorySchema
>

export const VisualizerFindingSchema = z
  .object({
    title: nonEmptyStringSchema.max(160),
    // Where the problem is in the learner's code.
    line: lineSchema,
    endLine: lineSchema.optional(),
    // The recorded step where it shows; only steps of this run.
    step: stepSchema.optional(),
    category: VisualizerFindingCategorySchema,
    severity: z.enum(['bug', 'risk', 'note']),
    explanation: nonEmptyStringSchema.max(1_200),
    // A nudge that does not give the fix away.
    hint: nonEmptyStringSchema.max(600),
    fix: z
      .object({
        code: nonEmptyStringSchema.max(2_000),
        explanation: nonEmptyStringSchema.max(600),
      })
      .strict()
      .optional(),
  })
  .strict()
export type VisualizerFinding = z.infer<typeof VisualizerFindingSchema>

export const VisualizerDebugVerdictSchema = z.enum([
  // A concrete bug explains the wrong output or the error.
  'bug_found',
  // The run stopped with an error; the findings explain it.
  'error_explained',
  // The output matches and nothing looks wrong for this input.
  'looks_correct',
  // Without an expected output the result cannot be judged.
  'needs_expected_output',
  // No confident diagnosis from this run.
  'unsure',
])
export type VisualizerDebugVerdict = z.infer<
  typeof VisualizerDebugVerdictSchema
>

export const VisualizerSuggestedTestSchema = z
  .object({
    input: z.string().max(2_000),
    reason: nonEmptyStringSchema.max(300),
  })
  .strict()

export const VisualizerDebugResultSchema = z
  .object({
    verdict: VisualizerDebugVerdictSchema,
    headline: nonEmptyStringSchema.max(200),
    summary: nonEmptyStringSchema.max(2_000),
    findings: z
      .array(VisualizerFindingSchema)
      .max(VISUALIZER_DEBUG_FINDING_LIMIT),
    // The answer to the learner's question in ask mode.
    answer: nonEmptyStringSchema.max(6_000).optional(),
    suggestedTests: z.array(VisualizerSuggestedTestSchema).max(3),
    followUps: z.array(nonEmptyStringSchema.max(160)).max(4),
  })
  .strict()
export type VisualizerDebugResult = z.infer<typeof VisualizerDebugResultSchema>

export const VisualizerDebugResponseSchema = z
  .object({ data: VisualizerDebugResultSchema })
  .strict()
export type VisualizerDebugResponse = z.infer<
  typeof VisualizerDebugResponseSchema
>

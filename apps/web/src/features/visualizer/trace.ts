// The execution trace shared by the C++ and Python engines and the
// visualizer UI. Engines record what the program actually did; nothing here is
// inferred by a model.

export type VisualizerLanguage = 'cpp' | 'python'

export const visualizerLanguageLabels: Record<VisualizerLanguage, string> = {
  cpp: 'C++',
  python: 'Python',
}

// How a sequence is drawn: plain cells, a set of chips, a stack (top last),
// a queue (front first), a deque, a priority queue (top first) or a tuple.
export type SequenceShape =
  'array' | 'set' | 'stack' | 'queue' | 'deque' | 'heap' | 'tuple'

// Values are interned: identical values share one id, so "changed" is an id
// comparison and a long trace stays small. Container items are value ids.
export type TraceValue =
  | { kind: 'number'; text: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'char'; text: string; code: number }
  | { kind: 'string'; text: string; length: number }
  | { kind: 'none'; text: string }
  | { kind: 'unset' }
  | {
      kind: 'sequence'
      type: string
      shape: SequenceShape
      items: number[]
      // Total length; items may hold only the visible prefix.
      length: number
    }
  | {
      kind: 'mapping'
      type: string
      entries: [number, number][]
      length: number
    }
  | { kind: 'record'; type: string; fields: [string, number][] }
  | { kind: 'opaque'; type: string; text: string }

export type TraceVariable = [name: string, value: number]

export type TraceFrame = {
  // Unique per activation; 0 is the global frame.
  id: number
  name: string
  // The line this frame is executing (the call site for outer frames).
  line: number
  vars: TraceVariable[]
  // Variables of very deep outer frames are not recorded.
  elided?: boolean
}

export type TraceEvent = 'line' | 'call' | 'return' | 'error'

// An element access such as a[i][j]: the root variable and index path.
export type TraceAccess = {
  frame: number
  name: string
  path: (number | string)[]
}

export type TraceStep = {
  event: TraceEvent
  line: number
  // Outermost first; the last frame is the one executing.
  frames: TraceFrame[]
  // Characters of standard output / error produced and input consumed so
  // far, after this step.
  out: number
  err: number
  in: number
  // The branch or loop condition result decided at this step.
  cond?: boolean
  // Loop header steps: which iteration begins (or the loop exits when cond
  // is false).
  loop?: { line: number; iteration: number }
  // Return value for return steps.
  value?: number
  reads?: TraceAccess[]
  writes?: TraceAccess[]
  // Warnings raised by this step, e.g. signed overflow.
  notes?: string[]
}

export type TraceErrorKind =
  | 'compile'
  | 'unsupported'
  | 'runtime'
  | 'timeout'
  | 'memory'
  | 'recursion'
  | 'output_limit'
  | 'input'
  | 'internal'

export type TraceError = {
  kind: TraceErrorKind
  title: string
  message: string
  line?: number
  column?: number
  details?: string[]
}

export type TraceBranchKind = 'if' | 'elif' | 'while' | 'for' | 'do' | 'switch'

// Branch and loop headers found in the source, with the last line of their
// body, so the UI can describe conditions and group loop iterations.
export type TraceBranch = {
  line: number
  endLine: number
  kind: TraceBranchKind
  text: string
}

export type TraceWarning = { step: number; line: number; message: string }

export type ExecutionTrace = {
  language: VisualizerLanguage
  steps: TraceStep[]
  values: TraceValue[]
  stdout: string
  stderr: string
  status: 'finished' | 'error'
  error?: TraceError
  // Recording stopped before the program ended (the step limit was reached);
  // execution may have continued without recording.
  truncated: boolean
  // Steps executed, including any that were not recorded.
  totalSteps: number
  branches: TraceBranch[]
  // Array name -> index variable names used with it in the source, for
  // drawing pointers under array cells.
  indexHints: Record<string, string[]>
  warnings: TraceWarning[]
  durationMs: number
}

export type TraceLimits = {
  // Steps recorded for the timeline.
  maxSteps: number
  // Wall-clock budget for the program itself.
  timeMs: number
  maxOutputChars: number
}

export const defaultTraceLimits: TraceLimits = {
  maxSteps: 10_000,
  timeMs: 5_000,
  maxOutputChars: 200_000,
}

export type TraceRequest = {
  language: VisualizerLanguage
  code: string
  input: string
  limits: TraceLimits
}

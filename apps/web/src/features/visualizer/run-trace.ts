import type { ExecutionTrace, TraceRequest, VisualizerLanguage } from './trace'
import type { RunPhase, WorkerRequest, WorkerResponse } from './worker/protocol'

// The worker enforces the time limit itself and still returns the steps it
// recorded. This outer limit only catches work it cannot interrupt, such as
// one very long built-in call.
const HARD_LIMIT_GRACE_MS = 8_000
const LOAD_LIMIT_MS = 90_000

type Pending = {
  id: number
  request: TraceRequest
  resolve: (trace: ExecutionTrace) => void
  reject: (error: Error) => void
  onPhase: (phase: RunPhase) => void
  timer: number | null
}

export class TraceRunnerError extends Error {
  readonly loading: boolean

  constructor(message: string, loading: boolean) {
    super(message)
    this.name = 'TraceRunnerError'
    this.loading = loading
  }
}

function stuckTrace(request: TraceRequest): ExecutionTrace {
  return {
    language: request.language,
    steps: [],
    values: [],
    stdout: '',
    stderr: '',
    status: 'error',
    error: {
      kind: 'timeout',
      title: 'The program did not stop',
      message:
        'It ran past the time limit inside a single long operation, so no steps could be kept.',
      details: [
        'For example sum(range(10**10)) in Python, or a huge sort.',
        'Try a smaller input.',
      ],
    },
    truncated: false,
    totalSteps: 0,
    branches: [],
    indexHints: {},
    warnings: [],
    durationMs: request.limits.timeMs + HARD_LIMIT_GRACE_MS,
  }
}

export class TraceRunner {
  private worker: Worker | null = null
  private nextId = 1
  private pending: Pending | null = null

  private ensureWorker(): Worker {
    if (this.worker !== null) return this.worker
    const worker = new Worker(
      new URL('./worker/visualizer.worker.ts', import.meta.url),
      { type: 'module', name: 'algomemtor-visualizer' },
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
      this.handle(event.data)
    worker.onerror = (event) => {
      event.preventDefault()
      const current = this.pending
      this.reset()
      current?.reject(
        new TraceRunnerError(
          'The code runner stopped unexpectedly. Try running again.',
          false,
        ),
      )
    }
    this.worker = worker
    return worker
  }

  private handle(message: WorkerResponse) {
    const current = this.pending
    if (current === null || message.id !== current.id) return
    if (message.type === 'phase') {
      current.onPhase(message.phase)
      this.arm(
        current,
        message.phase === 'loading'
          ? LOAD_LIMIT_MS
          : current.request.limits.timeMs + HARD_LIMIT_GRACE_MS,
      )
      return
    }
    this.clearTimer(current)
    this.pending = null
    if (message.type === 'result') current.resolve(message.trace)
    else current.reject(new TraceRunnerError(message.message, message.loading))
  }

  private arm(current: Pending, ms: number) {
    this.clearTimer(current)
    current.timer = window.setTimeout(() => {
      if (this.pending !== current) return
      this.reset()
      if (ms === LOAD_LIMIT_MS) {
        current.reject(
          new TraceRunnerError(
            'The Python runtime took too long to load. Check your connection and try again.',
            true,
          ),
        )
      } else {
        current.resolve(stuckTrace(current.request))
      }
    }, ms)
  }

  private clearTimer(current: Pending) {
    if (current.timer !== null) window.clearTimeout(current.timer)
    current.timer = null
  }

  // Stops the worker (and any running program); the next run starts fresh.
  private reset() {
    if (this.pending !== null) this.clearTimer(this.pending)
    this.pending = null
    this.worker?.terminate()
    this.worker = null
  }

  warmup(language: VisualizerLanguage) {
    const message: WorkerRequest = { type: 'warmup', language }
    this.ensureWorker().postMessage(message)
  }

  run(
    request: TraceRequest,
    onPhase: (phase: RunPhase) => void = () => undefined,
  ): Promise<ExecutionTrace> {
    this.cancel()
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending = { id, request, resolve, reject, onPhase, timer: null }
      const message: WorkerRequest = { type: 'run', id, request }
      worker.postMessage(message)
    })
  }

  // Abandons the current run. A program still running is stopped by
  // terminating the worker.
  cancel() {
    const current = this.pending
    if (current === null) return
    this.reset()
    current.reject(new TraceRunnerError('The run was cancelled.', false))
  }

  dispose() {
    this.cancel()
    this.worker?.terminate()
    this.worker = null
  }
}

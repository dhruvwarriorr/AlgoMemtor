import type { ExecutionTrace, TraceRequest, VisualizerLanguage } from '../trace'

export type RunPhase = 'loading' | 'running'

export type WorkerRequest =
  | { type: 'run'; id: number; request: TraceRequest }
  | { type: 'warmup'; language: VisualizerLanguage }

export type WorkerResponse =
  | { type: 'phase'; id: number; phase: RunPhase }
  | { type: 'result'; id: number; trace: ExecutionTrace }
  | { type: 'failure'; id: number; message: string; loading: boolean }

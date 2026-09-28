import type { PyodideAPI } from 'pyodide'

import type { ExecutionTrace, TraceRequest } from '../../trace'
import tracerSource from './tracer.py'

type RunTrace = ((
  code: string,
  input: string,
  maxSteps: number,
  timeMs: number,
  maxOutput: number,
) => string) & { destroy?: () => void }

// Installs the tracer into a loaded Pyodide runtime.
export function installTracer(pyodide: PyodideAPI) {
  pyodide.runPython(tracerSource)
}

export function runPython(
  pyodide: PyodideAPI,
  request: TraceRequest,
): ExecutionTrace {
  const globals = pyodide.globals as unknown as {
    get(name: string): unknown
  }
  const run = globals.get('run_trace') as RunTrace
  try {
    const json = run(
      request.code,
      request.input,
      request.limits.maxSteps,
      request.limits.timeMs,
      request.limits.maxOutputChars,
    )
    return JSON.parse(json) as ExecutionTrace
  } finally {
    run.destroy?.()
  }
}

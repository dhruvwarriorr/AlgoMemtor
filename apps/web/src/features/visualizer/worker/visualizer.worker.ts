/// <reference lib="webworker" />
// Runs learner code off the main thread, in the learner's own browser. C++
// and Java run in TypeScript interpreters; Python runs in Pyodide, which is
// loaded once from this app's own origin. Nothing is sent to a server.

import type { loadPyodide as LoadPyodide, PyodideAPI } from 'pyodide'
import pyodidePackage from 'pyodide/package.json'

import { runCpp } from '../engines/cpp'
import type { ExecutionTrace, TraceRequest } from '../trace'
import type { WorkerRequest, WorkerResponse } from './protocol'

declare const self: DedicatedWorkerGlobalScope

let python: Promise<PyodideAPI> | null = null

function post(message: WorkerResponse) {
  self.postMessage(message)
}

// Learner programs never need the network or storage; remove them once the
// runtime has finished loading its own files.
function lockDown() {
  const scope = self as unknown as Record<string, unknown>
  for (const name of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'EventSource',
    'importScripts',
    'indexedDB',
    'caches',
    'BroadcastChannel',
  ]) {
    try {
      Object.defineProperty(scope, name, {
        value: undefined,
        writable: false,
        configurable: false,
      })
    } catch {
      // Some properties are not configurable in every browser.
    }
  }
}

async function loadPython(): Promise<PyodideAPI> {
  python ??= (async () => {
    // The runtime is served as-is from public/pyodide/<version>/ (see
    // scripts/copy-pyodide.mjs) and loaded from there, not bundled.
    const indexURL = new URL(
      `/pyodide/${pyodidePackage.version}/`,
      self.location.origin,
    ).href
    const [{ loadPyodide }, engine] = await Promise.all([
      import(/* turbopackIgnore: true */ `${indexURL}pyodide.mjs`) as Promise<{
        loadPyodide: typeof LoadPyodide
      }>,
      import('../engines/python'),
    ])
    const runtime = await loadPyodide({
      indexURL,
      stdout: () => undefined,
      stderr: () => undefined,
    })
    engine.installTracer(runtime)
    lockDown()
    return runtime
  })()
  try {
    return await python
  } catch (error) {
    python = null
    throw error
  }
}

async function run(request: TraceRequest): Promise<ExecutionTrace> {
  if (request.language === 'python') {
    const runtime = await loadPython()
    const { runPython } = await import('../engines/python')
    return runPython(runtime, request)
  }
  if (request.language === 'java') {
    const { runJava } = await import('../engines/java')
    return runJava(request)
  }
  return runCpp(request)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'warmup') {
    if (message.language === 'python') {
      void loadPython().catch(() => undefined)
    }
    return
  }
  const { id, request } = message
  const needsLoad = request.language === 'python' && python === null
  post({ type: 'phase', id, phase: needsLoad ? 'loading' : 'running' })
  const started =
    request.language === 'python'
      ? loadPython().then(() => post({ type: 'phase', id, phase: 'running' }))
      : Promise.resolve()
  started
    .then(() => run(request))
    .then((trace) => post({ type: 'result', id, trace }))
    .catch((error: unknown) => {
      post({
        type: 'failure',
        id,
        message: error instanceof Error ? error.message : String(error),
        loading: request.language === 'python' && python === null,
      })
    })
}

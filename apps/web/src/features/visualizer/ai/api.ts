import {
  VisualizerDebugRequestSchema,
  VisualizerDebugResponseSchema,
  type VisualizerDebugRequest,
} from '@algomemtor/shared-contracts'
import { useMutation } from '@tanstack/react-query'

import { requestJson } from '@/features/discovery/api/client'

// Sends the code, the input and the run digest to the AI Debugger. Called
// only when the learner asks; nothing is stored.
export function debugVisualizerRun(
  input: VisualizerDebugRequest,
  signal?: AbortSignal,
) {
  return requestJson('/api/visualizer/debug', {
    authentication: 'required',
    body: JSON.stringify(VisualizerDebugRequestSchema.parse(input)),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    schema: VisualizerDebugResponseSchema,
    signal,
  })
}

export function useVisualizerDebug() {
  return useMutation({
    mutationFn: (input: VisualizerDebugRequest) => debugVisualizerRun(input),
  })
}

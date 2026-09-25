import type { ExecutionTrace } from '../trace'

export type Marker = {
  step: number
  tone: 'call' | 'output' | 'warning' | 'danger' | 'breakpoint' | 'finding'
}

export function traceMarkers(
  trace: ExecutionTrace,
  extra: Marker[] = [],
): Marker[] {
  const markers: Marker[] = []
  const budget = 160
  const stride = Math.max(1, Math.ceil(trace.steps.length / budget))
  trace.steps.forEach((step, index) => {
    const previous = trace.steps[index - 1]
    if (step.event === 'error') markers.push({ step: index, tone: 'danger' })
    else if (step.notes !== undefined)
      markers.push({ step: index, tone: 'warning' })
    else if (
      index % stride === 0 &&
      previous !== undefined &&
      step.out > previous.out
    ) {
      markers.push({ step: index, tone: 'output' })
    } else if (index % stride === 0 && step.event === 'call') {
      markers.push({ step: index, tone: 'call' })
    }
  })
  return [...markers, ...extra]
}

import { useEffect, useState } from 'react'

import { TraceRunner } from './run-trace'

// One code runner (Web Worker) per page; it is stopped when the page closes.
export function useTraceRunner(): TraceRunner {
  const [runner] = useState(() => new TraceRunner())
  useEffect(() => () => runner.dispose(), [runner])
  return runner
}

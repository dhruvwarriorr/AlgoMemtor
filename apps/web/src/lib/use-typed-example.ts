import { useEffect, useState } from 'react'

// Types example prompts out one after another, then deletes them, for an
// empty input's animated placeholder. Returns the text typed so far.
export function useTypedExample(examples: readonly string[], enabled: boolean) {
  const [state, setState] = useState({ example: 0, length: 0, deleting: false })
  useEffect(() => {
    if (!enabled) return
    const full = examples[state.example] ?? ''
    const done = !state.deleting && state.length === full.length
    const timer = window.setTimeout(
      () =>
        setState((previous) => {
          const text = examples[previous.example] ?? ''
          if (!previous.deleting && previous.length < text.length) {
            return { ...previous, length: previous.length + 1 }
          }
          if (!previous.deleting) return { ...previous, deleting: true }
          if (previous.length > 0) {
            return { ...previous, length: previous.length - 1 }
          }
          return {
            example: (previous.example + 1) % examples.length,
            length: 0,
            deleting: false,
          }
        }),
      done ? 1600 : state.deleting ? 28 : 55,
    )
    return () => window.clearTimeout(timer)
  }, [enabled, examples, state])
  return (examples[state.example] ?? '').slice(0, state.length)
}

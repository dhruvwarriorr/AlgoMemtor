import { loadPyodide, type PyodideAPI } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'

import { compareOutput } from './analysis'
import { runCpp } from './engines/cpp'
import { runJava } from './engines/java'
import { installTracer, runPython } from './engines/python'
import { buildScene } from './scene/build'
import { examplePrograms, exampleLanguages } from './examples'
import { defaultTraceLimits, type TraceRequest } from './trace'

let pyodide: PyodideAPI

beforeAll(async () => {
  pyodide = await loadPyodide()
  installTracer(pyodide)
}, 60_000)

function run(request: TraceRequest) {
  if (request.language === 'python') return runPython(pyodide, request)
  if (request.language === 'java') return runJava(request)
  return runCpp(request)
}

describe('visualizer examples', () => {
  for (const program of examplePrograms) {
    for (const language of exampleLanguages(program)) {
      it(`${program.id} (${language}) ${program.bug === true ? 'shows its bug' : 'prints the expected output'}`, () => {
        const code = program.code[language] ?? ''
        const trace = run({
          language,
          code,
          input: program.input,
          limits: defaultTraceLimits,
        })
        expect(trace.steps.length).toBeGreaterThan(0)
        if (program.bug === true) {
          const failed =
            trace.error !== undefined ||
            compareOutput(trace, program.expected).status === 'mismatch'
          expect(failed).toBe(true)
        } else {
          expect(trace.error?.message).toBeUndefined()
          expect(compareOutput(trace, program.expected).status).toBe('match')
        }
        // Every step can be drawn.
        const lines = code.split('\n')
        for (
          let index = 0;
          index < trace.steps.length;
          index += Math.max(1, Math.floor(trace.steps.length / 40))
        ) {
          buildScene(trace, index, lines)
        }
      })
    }
  }
})

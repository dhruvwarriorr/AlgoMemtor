import type { ExecutionTrace, TraceRequest } from '../../trace'
import { Interpreter } from './interpreter'
import { CppCompileError } from './lexer'
import { parseProgram } from './parser'
import { preprocess } from './preprocess'
import { now } from './runtime'

export function runCpp(request: TraceRequest): ExecutionTrace {
  const started = now()
  const empty: ExecutionTrace = {
    language: 'cpp',
    steps: [],
    values: [],
    stdout: '',
    stderr: '',
    status: 'error',
    truncated: false,
    totalSteps: 0,
    branches: [],
    indexHints: {},
    warnings: [],
    durationMs: 0,
  }
  let program
  try {
    program = parseProgram(preprocess(request.code))
  } catch (error) {
    if (error instanceof CppCompileError) {
      return {
        ...empty,
        error: {
          kind: error.unsupported ? 'unsupported' : 'compile',
          title: error.unsupported
            ? 'Not supported by the visualizer'
            : 'The code does not compile',
          message: error.message,
          line: error.line,
          ...(error.column === undefined ? {} : { column: error.column }),
        },
        durationMs: now() - started,
      }
    }
    return {
      ...empty,
      error: {
        kind: 'internal',
        title: 'The code could not be read',
        message: error instanceof Error ? error.message : String(error),
      },
      durationMs: now() - started,
    }
  }
  const result = new Interpreter(program, request.input, request.limits).run()
  return {
    ...empty,
    ...result,
    branches: program.branches,
    indexHints: program.indexHints,
    durationMs: now() - started,
  }
}

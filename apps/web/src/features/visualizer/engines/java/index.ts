import type { ExecutionTrace, TraceRequest } from '../../trace'
import { CppCompileError } from '../cpp/lexer'
import { now } from '../cpp/runtime'
import { JavaInterpreter } from './interpreter'
import { tokenizeJava } from './lexer'
import { parseJava } from './parser'

export function runJava(request: TraceRequest): ExecutionTrace {
  const started = now()
  const empty: ExecutionTrace = {
    language: 'java',
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
    program = parseJava(tokenizeJava(request.code))
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
  const result = new JavaInterpreter(
    program,
    request.input,
    request.limits,
  ).run()
  return {
    ...empty,
    ...result,
    language: 'java',
    branches: program.branches,
    indexHints: program.indexHints,
    durationMs: now() - started,
  }
}
